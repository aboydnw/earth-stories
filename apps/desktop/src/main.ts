import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { DesktopPaths } from "./paths.js";
import {
  registerDesktopIpcHandlers,
  type DesktopIpcWebContents,
} from "./ipc.js";
import { resolveDesktopPaths } from "./paths.js";
import { DesktopService } from "./service.js";
import {
  createDesktopWindowOptions,
  installDesktopSessionPolicies,
  installNavigationPolicy,
  type DesktopNavigationTarget,
  type DesktopSessionPolicyTarget,
} from "./window.js";

let activeDesktopLifecycle: DesktopMainLifecycle | null = null;

export interface WindowDimensions {
  width: number;
  height: number;
}

export interface QuitEvent {
  preventDefault(): void;
}

export interface DesktopWindow {
  destroy(): void;
  load(): Promise<void>;
  requestClose(): Promise<boolean>;
  focus(): void;
  isMinimized(): boolean;
  restore(): void;
  onDimensionsChanged(listener: (dimensions: WindowDimensions) => void): void;
}

export interface StartupErrorWindow {
  onClosed(listener: () => void): void;
}

export interface DesktopMainLifecycle {
  startupErrorWindow: StartupErrorWindow | null;
}

export interface DesktopApplication {
  requestSingleInstanceLock(): boolean;
  whenReady(): Promise<unknown>;
  quit(): void;
  onSecondInstance(listener: (argv: string[]) => void): void;
  onOpenFile(listener: (path: string) => void): void;
  onBeforeQuit(listener: (event: QuitEvent) => void): void;
}

export interface MainService {
  capabilityToken: string;
  start(): Promise<string>;
  shutdown(): Promise<void>;
}

export interface DesktopMainDependencies {
  app: DesktopApplication;
  paths: DesktopPaths;
  launchArguments: string[];
  service: MainService;
  createSession(): unknown;
  installHeaderHook(
    session: unknown,
    options: { origin: string; capabilityToken: string },
  ): void;
  installSessionPolicies(session: unknown, options: { origin: string }): void;
  probeSession(session: unknown, options: { origin: string }): Promise<void>;
  installIpcHandlers(options: { origin: string; session: unknown }): void;
  createWindow(options: {
    origin: string;
    session: unknown;
    dimensions: WindowDimensions;
  }): DesktopWindow;
  createStartupErrorWindow(options: {
    message: string;
    logsDirectory: string;
  }): StartupErrorWindow;
  queueFileArgument(path: string): void;
  readDimensions(path: string): Promise<WindowDimensions>;
  writeDimensions(path: string, dimensions: WindowDimensions): Promise<void>;
}

const DEFAULT_WINDOW_DIMENSIONS: WindowDimensions = {
  width: 1280,
  height: 800,
};

export function capabilityRequestHeaders(
  requestUrl: string,
  headers: Record<string, string>,
  serviceOrigin: string,
  capabilityToken: string,
): Record<string, string> {
  try {
    if (new URL(requestUrl).origin !== serviceOrigin) return { ...headers };
  } catch {
    return { ...headers };
  }
  return {
    ...headers,
    Authorization: `Bearer ${capabilityToken}`,
  };
}

function validDimension(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 400;
}

export async function readWindowDimensions(
  path: string,
): Promise<WindowDimensions> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      width?: unknown;
      height?: unknown;
    };
    if (validDimension(parsed.width) && validDimension(parsed.height))
      return { width: parsed.width, height: parsed.height };
  } catch {
    // A missing or malformed preference file falls back to safe dimensions.
  }
  return { ...DEFAULT_WINDOW_DIMENSIONS };
}

export async function writeWindowDimensions(
  path: string,
  dimensions: WindowDimensions,
): Promise<void> {
  if (!validDimension(dimensions.width) || !validDimension(dimensions.height))
    return;
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(
      temporary,
      `${JSON.stringify({
        width: dimensions.width,
        height: dimensions.height,
      })}\n`,
      "utf8",
    );
    await rename(temporary, path);
  } catch (cause) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw cause;
  }
}

export function createDimensionPersistence(options: {
  path: string;
  delayMs?: number;
  write(path: string, dimensions: WindowDimensions): Promise<void>;
  reportError(cause: unknown): void;
}) {
  let latest: WindowDimensions | null = null;
  let timer: NodeJS.Timeout | null = null;
  let writing = Promise.resolve();
  const persistLatest = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const dimensions = latest;
    latest = null;
    if (!dimensions) return;
    writing = writing.then(() => options.write(options.path, dimensions));
    await writing.catch((cause) => options.reportError(cause));
    writing = writing.catch(() => undefined);
    if (latest) await persistLatest();
  };
  return {
    schedule(dimensions: WindowDimensions) {
      latest = dimensions;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void persistLatest(), options.delayMs ?? 150);
      timer.unref?.();
    },
    flush: persistLatest,
  };
}

export function requireServiceOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The local service reported an invalid origin.");
  }
  const port = Number(url.port);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.origin !== value
  )
    throw new Error("The local service reported an invalid origin.");
  return url.origin;
}

export function createEphemeralSessionPartition(): string {
  return `earth-stories-${randomUUID()}`;
}

function fileArguments(argv: string[]): string[] {
  return argv.filter((argument) => /\.earthstory$/i.test(argument));
}

function startupMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "Earth Stories could not start its local service.";
}

export async function launchDesktopMain(
  dependencies: DesktopMainDependencies,
): Promise<DesktopMainLifecycle> {
  const lifecycle: DesktopMainLifecycle = { startupErrorWindow: null };
  if (!dependencies.app.requestSingleInstanceLock()) {
    dependencies.app.quit();
    return lifecycle;
  }

  let window: DesktopWindow | null = null;
  let shuttingDown = false;
  let allowQuit = false;

  dependencies.app.onSecondInstance((argv) => {
    for (const path of fileArguments(argv))
      dependencies.queueFileArgument(path);
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  dependencies.app.onOpenFile((path) => dependencies.queueFileArgument(path));
  for (const path of fileArguments(dependencies.launchArguments))
    dependencies.queueFileArgument(path);
  dependencies.app.onBeforeQuit((event) => {
    if (allowQuit) return;
    event.preventDefault();
    if (shuttingDown) return;
    shuttingDown = true;
    void (async () => {
      if (window && !(await window.requestClose())) {
        shuttingDown = false;
        return;
      }
      await dependencies.service.shutdown().catch(() => undefined);
      allowQuit = true;
      dependencies.app.quit();
    })();
  });

  await dependencies.app.whenReady();

  const showStartupError = (cause: unknown) => {
    const errorWindow = dependencies.createStartupErrorWindow({
      message: startupMessage(cause),
      logsDirectory: dependencies.paths.logsDirectory,
    });
    lifecycle.startupErrorWindow = errorWindow;
    errorWindow.onClosed(() => {
      if (lifecycle.startupErrorWindow === errorWindow)
        lifecycle.startupErrorWindow = null;
    });
  };

  let startedOrigin: string;
  try {
    startedOrigin = await dependencies.service.start();
  } catch (cause) {
    showStartupError(cause);
    return lifecycle;
  }
  let origin: string;
  try {
    origin = requireServiceOrigin(startedOrigin);
  } catch (cause) {
    await dependencies.service.shutdown().catch(() => undefined);
    showStartupError(cause);
    return lifecycle;
  }
  try {
    const desktopSession = dependencies.createSession();
    dependencies.installHeaderHook(desktopSession, {
      origin,
      capabilityToken: dependencies.service.capabilityToken,
    });
    dependencies.installSessionPolicies(desktopSession, { origin });
    await dependencies.probeSession(desktopSession, { origin });
    dependencies.installIpcHandlers({ origin, session: desktopSession });
    const dimensions = await dependencies.readDimensions(
      dependencies.paths.windowPreferencesFile,
    );
    window = dependencies.createWindow({
      origin,
      session: desktopSession,
      dimensions,
    });
    await window.load();
    const persistence = createDimensionPersistence({
      path: dependencies.paths.windowPreferencesFile,
      write: dependencies.writeDimensions,
      reportError: (cause) =>
        console.error("Could not save window size.", cause),
    });
    window.onDimensionsChanged((next) => persistence.schedule(next));
  } catch (cause) {
    window?.destroy();
    window = null;
    await dependencies.service.shutdown().catch(() => undefined);
    showStartupError(cause);
  }
  return lifecycle;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

export async function runElectronDesktop(): Promise<void> {
  const electron = await import("electron");
  const { app, BrowserWindow, ipcMain, session, shell } = electron;
  const ownsSingleInstanceLock = app.requestSingleInstanceLock();
  if (!ownsSingleInstanceLock) {
    app.quit();
    return;
  }
  const sourceDirectory = dirname(fileURLToPath(import.meta.url));
  const paths = resolveDesktopPaths({
    isPackaged: app.isPackaged,
    applicationDirectory: app.isPackaged
      ? app.getAppPath()
      : resolve(sourceDirectory, ".."),
    resourcesDirectory: process.resourcesPath,
    userDataDirectory: app.getPath("userData"),
    documentsDirectory: app.getPath("documents"),
    platform: process.platform,
  });
  await mkdir(paths.logsDirectory, { recursive: true });
  const localService = new DesktopService(paths);
  // Routing infrastructure only: the later handoff importer will consume these.
  const pendingFiles: string[] = [];
  let primaryWebContents: DesktopIpcWebContents | null = null;

  activeDesktopLifecycle = await launchDesktopMain({
    paths,
    launchArguments: process.argv,
    service: localService,
    app: {
      requestSingleInstanceLock: () => ownsSingleInstanceLock,
      whenReady: () => app.whenReady(),
      quit: () => app.quit(),
      onSecondInstance: (listener) => {
        app.on("second-instance", (_event, argv) => listener(argv));
      },
      onOpenFile: (listener) => {
        app.on("open-file", (event, path) => {
          event.preventDefault();
          listener(path);
        });
      },
      onBeforeQuit: (listener) => {
        app.on("before-quit", (event) => listener(event));
      },
    },
    createSession: () =>
      session.fromPartition(createEphemeralSessionPartition()),
    installIpcHandlers: ({ origin, session: desktopSession }) => {
      registerDesktopIpcHandlers({
        ipcMain,
        service: localService,
        shell,
        projectsDirectory: paths.projectsDirectory,
        origin,
        session: desktopSession,
        expectedWebContents: () => primaryWebContents,
      });
    },
    installHeaderHook: (desktopSession, options) => {
      const value = desktopSession as Electron.Session;
      value.webRequest.onBeforeSendHeaders(
        { urls: [`${options.origin}/*`] },
        (details, callback) => {
          callback({
            requestHeaders: capabilityRequestHeaders(
              details.url,
              details.requestHeaders as Record<string, string>,
              options.origin,
              options.capabilityToken,
            ),
          });
        },
      );
    },
    installSessionPolicies: (desktopSession, { origin }) => {
      installDesktopSessionPolicies(
        desktopSession as DesktopSessionPolicyTarget,
        origin,
      );
    },
    probeSession: async (desktopSession, { origin }) => {
      const response = await (desktopSession as Electron.Session).fetch(
        `${origin}/health`,
      );
      if (!response.ok)
        throw new Error(
          `Local service health check failed (${response.status}).`,
        );
    },
    createWindow: ({ origin, session: desktopSession, dimensions }) => {
      const browserWindow = new BrowserWindow(
        createDesktopWindowOptions({
          dimensions,
          preloadPath: resolve(sourceDirectory, "preload.cjs"),
          session: desktopSession,
        }) as Electron.BrowserWindowConstructorOptions,
      );
      primaryWebContents = browserWindow.webContents;
      installNavigationPolicy(
        browserWindow.webContents as unknown as DesktopNavigationTarget,
        { origin, openExternal: (url) => shell.openExternal(url) },
      );
      browserWindow.once("ready-to-show", () => browserWindow.show());
      return {
        destroy: () => browserWindow.destroy(),
        load: () => browserWindow.loadURL(origin).then(() => undefined),
        requestClose: () =>
          new Promise<boolean>((resolveClose) => {
            const onClosed = () => {
              browserWindow.webContents.removeListener(
                "will-prevent-unload",
                onPrevented,
              );
              resolveClose(true);
            };
            const onPrevented = () => {
              browserWindow.removeListener("closed", onClosed);
              resolveClose(false);
            };
            browserWindow.once("closed", onClosed);
            browserWindow.webContents.once("will-prevent-unload", onPrevented);
            browserWindow.close();
          }),
        focus: () => browserWindow.focus(),
        isMinimized: () => browserWindow.isMinimized(),
        restore: () => browserWindow.restore(),
        onDimensionsChanged: (listener) => {
          browserWindow.on("resize", () => {
            const [width, height] = browserWindow.getSize();
            listener({ width, height });
          });
        },
      };
    },
    createStartupErrorWindow: ({ message, logsDirectory }) => {
      const errorWindow = new BrowserWindow({
        width: 640,
        height: 360,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      const logsUrl = pathToFileURL(logsDirectory).href;
      errorWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url === logsUrl) void shell.openPath(logsDirectory);
        return { action: "deny" };
      });
      const html = `<!doctype html><html><meta charset="utf-8"><title>Earth Stories could not start</title><style>body{max-width:36rem;margin:3rem auto;padding:0 2rem;font:16px/1.5 system-ui;color:#231f1b}h1{font-size:1.5rem}a{color:#075a9c}</style><body><h1>Earth Stories could not start</h1><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(logsUrl)}" target="_blank">Open logs</a></p></body></html>`;
      void errorWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
      );
      return {
        onClosed: (listener) => errorWindow.once("closed", listener),
      };
    },
    queueFileArgument: (path) => pendingFiles.push(path),
    readDimensions: readWindowDimensions,
    writeDimensions: writeWindowDimensions,
  });
}

const entrypoint = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (entrypoint && process.versions.electron) void runElectronDesktop();

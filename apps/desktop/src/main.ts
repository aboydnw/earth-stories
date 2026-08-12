import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { DesktopPaths } from "./paths.js";
import { resolveDesktopPaths } from "./paths.js";
import { DesktopService } from "./service.js";

let activeDesktopLifecycle: DesktopMainLifecycle | null = null;

export interface WindowDimensions {
  width: number;
  height: number;
}

export interface QuitEvent {
  preventDefault(): void;
}

export interface DesktopWindow {
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
  await writeFile(
    path,
    `${JSON.stringify({
      width: dimensions.width,
      height: dimensions.height,
    })}\n`,
    "utf8",
  );
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
    void dependencies.service.shutdown().then(
      () => {
        allowQuit = true;
        dependencies.app.quit();
      },
      () => {
        allowQuit = true;
        dependencies.app.quit();
      },
    );
  });

  await dependencies.app.whenReady();

  let origin: string;
  try {
    origin = await dependencies.service.start();
  } catch (cause) {
    const errorWindow = dependencies.createStartupErrorWindow({
      message: startupMessage(cause),
      logsDirectory: dependencies.paths.logsDirectory,
    });
    lifecycle.startupErrorWindow = errorWindow;
    errorWindow.onClosed(() => {
      if (lifecycle.startupErrorWindow === errorWindow)
        lifecycle.startupErrorWindow = null;
    });
    return lifecycle;
  }

  const desktopSession = dependencies.createSession();
  dependencies.installHeaderHook(desktopSession, {
    origin,
    capabilityToken: dependencies.service.capabilityToken,
  });
  const dimensions = await dependencies.readDimensions(
    dependencies.paths.windowPreferencesFile,
  );
  window = dependencies.createWindow({
    origin,
    session: desktopSession,
    dimensions,
  });
  window.onDimensionsChanged((next) => {
    void dependencies.writeDimensions(
      dependencies.paths.windowPreferencesFile,
      next,
    );
  });
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
  const { app, BrowserWindow, session, shell } = electron;
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
  const pendingFiles: string[] = [];

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
    createSession: () => session.fromPartition("persist:earth-stories"),
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
    createWindow: ({ origin, session: desktopSession, dimensions }) => {
      const browserWindow = new BrowserWindow({
        ...dimensions,
        show: false,
        webPreferences: {
          session: desktopSession as Electron.Session,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      void browserWindow.loadURL(origin);
      browserWindow.once("ready-to-show", () => browserWindow.show());
      return {
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

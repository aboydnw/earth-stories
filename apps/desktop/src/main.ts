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
import { createSafeStorageCredentialStoreFactory } from "./credentials.js";
import { DesktopTools } from "./tools.js";
import { resolveLaunchWorkspace, type FirstRunChoice } from "./firstRun.js";
import {
  looksLikeWorkspace,
  validateWorkspace,
  writeWorkspacePointer,
} from "./workspace.js";
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
  onClosed(listener: () => void): void;
}

export interface BrowserWindowCloseTarget {
  isDestroyed(): boolean;
  close(): void;
  once(event: "closed", listener: () => void): unknown;
  removeListener(event: "closed", listener: () => void): unknown;
  webContents: {
    once(event: "will-prevent-unload", listener: () => void): unknown;
    removeListener(event: "will-prevent-unload", listener: () => void): unknown;
  };
}

export interface StartupErrorWindow {
  onClosed(listener: () => void): void;
}

export interface DesktopMainLifecycle {
  startupErrorWindow: StartupErrorWindow | null;
  launched: boolean;
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

export async function changeDesktopWorkspace(options: {
  currentWorkspace: string;
  nextWorkspace: string;
  restartWithWorkspace(path: string): Promise<string>;
  writePointer(path: string): Promise<unknown>;
  activate(state: { workspace: string; origin: string }): Promise<void>;
}): Promise<string> {
  let pointerUpdated = false;
  try {
    const origin = requireServiceOrigin(
      await options.restartWithWorkspace(options.nextWorkspace),
    );
    await options.writePointer(options.nextWorkspace);
    pointerUpdated = true;
    await options.activate({ workspace: options.nextWorkspace, origin });
    return options.nextWorkspace;
  } catch (cause) {
    try {
      const origin = requireServiceOrigin(
        await options.restartWithWorkspace(options.currentWorkspace),
      );
      if (pointerUpdated) await options.writePointer(options.currentWorkspace);
      await options.activate({ workspace: options.currentWorkspace, origin });
    } catch (recoveryCause) {
      throw new AggregateError(
        [cause, recoveryCause],
        "Earth Stories could not change workspaces or restore the previous workspace.",
      );
    }
    throw cause;
  }
}

export function createEphemeralSessionPartition(): string {
  return `earth-stories-${randomUUID()}`;
}

export function requestBrowserWindowClose(
  browserWindow: BrowserWindowCloseTarget,
): Promise<boolean> {
  if (browserWindow.isDestroyed()) return Promise.resolve(true);
  return new Promise<boolean>((resolveClose) => {
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
  });
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
  const lifecycle: DesktopMainLifecycle = {
    startupErrorWindow: null,
    launched: false,
  };
  if (!dependencies.app.requestSingleInstanceLock()) {
    dependencies.app.quit();
    return lifecycle;
  }

  let window: DesktopWindow | null = null;
  let shuttingDown = false;
  let allowQuit = false;
  let windowLoaded = false;
  let windowClosedDuringStartup = false;
  let suppressWindowClose = false;

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
    const openedWindow = dependencies.createWindow({
      origin,
      session: desktopSession,
      dimensions,
    });
    window = openedWindow;
    openedWindow.onClosed(() => {
      if (window === openedWindow) window = null;
      if (suppressWindowClose) return;
      if (!windowLoaded) windowClosedDuringStartup = true;
      if (shuttingDown || allowQuit) return;
      shuttingDown = true;
      void (async () => {
        await dependencies.service.shutdown().catch(() => undefined);
        allowQuit = true;
        dependencies.app.quit();
      })();
    });
    await openedWindow.load();
    windowLoaded = true;
    lifecycle.launched = true;
    if (window !== openedWindow) return lifecycle;
    const persistence = createDimensionPersistence({
      path: dependencies.paths.windowPreferencesFile,
      write: dependencies.writeDimensions,
      reportError: (cause) =>
        console.error("Could not save window size.", cause),
    });
    window.onDimensionsChanged((next) => persistence.schedule(next));
  } catch (cause) {
    if (windowClosedDuringStartup) return lifecycle;
    suppressWindowClose = true;
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
  const { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell } =
    electron;
  const ownsSingleInstanceLock = app.requestSingleInstanceLock();
  if (!ownsSingleInstanceLock) {
    app.quit();
    return;
  }
  const sourceDirectory = dirname(fileURLToPath(import.meta.url));
  let paths = resolveDesktopPaths({
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
  await app.whenReady();
  const pickFolder = async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: "Choose an Earth Stories workspace",
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  };
  const selectedWorkspace = await resolveLaunchWorkspace({
    pointerFile: paths.workspacePointerFile,
    defaultPath: paths.projectsDirectory,
    choose: async (defaultPath) => {
      const result = await dialog.showMessageBox({
        type: "question",
        title: "Choose where Earth Stories keeps your work",
        message: "Choose your Earth Stories workspace",
        detail: `The default folder is:\n${defaultPath}\n\nEarth Stories will not scan for or move existing projects.`,
        buttons: [
          "Use default",
          "Choose existing workspace",
          "Use another folder",
          "Cancel",
        ],
        cancelId: 3,
        defaultId: 0,
      });
      if (result.response === 0) return { kind: "default" };
      if (result.response === 3) return null;
      const path = await pickFolder();
      return path
        ? ({
            kind: result.response === 1 ? "existing" : "other",
            path,
          } satisfies Exclude<FirstRunChoice, null>)
        : null;
    },
    confirm: async ({ path, willCreate, containsProjects }) => {
      const result = await dialog.showMessageBox({
        type: "question",
        title: "Confirm workspace",
        message: willCreate
          ? "Create this workspace?"
          : containsProjects
            ? "Use this existing workspace?"
            : "Use this empty folder as a new workspace?",
        detail: path,
        buttons: [willCreate ? "Create workspace" : "Use folder", "Cancel"],
        defaultId: 0,
        cancelId: 1,
      });
      return result.response === 0;
    },
    reportInvalid: async ({ findings }) => {
      await dialog.showMessageBox({
        type: "error",
        title: "This folder cannot be used",
        message: findings[0]?.message ?? "Choose another workspace folder.",
      });
    },
  });
  if (!selectedWorkspace) {
    app.quit();
    return;
  }
  paths = { ...paths, projectsDirectory: selectedWorkspace };
  const desktopTools = new DesktopTools({
    appVersion: app.getVersion(),
    masterDirectory: paths.conversionManifestDirectory,
    toolsDirectory: paths.toolsDirectory,
    pixiExecutable: paths.pixiExecutable,
    workerDirectory: paths.conversionWorkerDirectory,
    installerScript: app.isPackaged
      ? resolve(process.resourcesPath, "conversion/install-pixi.mjs")
      : resolve(sourceDirectory, "../../../scripts/install-pixi.mjs"),
  });
  const toolRuntime = await desktopTools.prepareRuntime();
  const localService = new DesktopService(paths, {
    tools: toolRuntime,
    bootstrapPixi: desktopTools.bootstrapPixi,
    createCredentialStore: createSafeStorageCredentialStoreFactory(safeStorage),
  });
  // Routing infrastructure only: the later handoff importer will consume these.
  const pendingFiles: string[] = [];
  let primaryWebContents: DesktopIpcWebContents | null = null;
  let primaryBrowserWindow: Electron.BrowserWindow | null = null;
  let currentOrigin = "";

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
      currentOrigin = origin;
      registerDesktopIpcHandlers({
        ipcMain,
        service: localService,
        shell,
        projectsDirectory: () => paths.projectsDirectory,
        origin: () => currentOrigin,
        session: desktopSession,
        expectedWebContents: () => primaryWebContents,
        tools: desktopTools,
        chooseWorkspace: async () => {
          const path = await pickFolder();
          if (!path || path === paths.projectsDirectory) return null;
          const validation = await validateWorkspace(path);
          if (!validation.ok) {
            await dialog.showMessageBox({
              type: "error",
              title: "This folder cannot be used",
              message: validation.findings[0]?.message,
            });
            return null;
          }
          const containsProjects = await looksLikeWorkspace(path);
          const confirmation = await dialog.showMessageBox({
            type: "question",
            title: "Change workspace?",
            message: containsProjects
              ? "Open this workspace?"
              : "Use this empty folder as a new workspace?",
            detail: `${path}\n\nEarth Stories will not move or copy projects.`,
            buttons: ["Change workspace", "Cancel"],
            defaultId: 0,
            cancelId: 1,
          });
          if (confirmation.response !== 0) return null;
          return changeDesktopWorkspace({
            currentWorkspace: paths.projectsDirectory,
            nextWorkspace: path,
            restartWithWorkspace: (workspace) =>
              localService.restartWithWorkspace(workspace, {
                unsavedStateResolved: true,
              }),
            writePointer: (workspace) =>
              writeWorkspacePointer(paths.workspacePointerFile, workspace),
            activate: async ({ workspace, origin }) => {
              paths = { ...paths, projectsDirectory: workspace };
              currentOrigin = origin;
              const value = desktopSession as Electron.Session;
              value.webRequest.onBeforeSendHeaders(
                { urls: [`${currentOrigin}/*`] },
                (details, callback) => {
                  callback({
                    requestHeaders: capabilityRequestHeaders(
                      details.url,
                      details.requestHeaders as Record<string, string>,
                      currentOrigin,
                      localService.capabilityToken,
                    ),
                  });
                },
              );
              installDesktopSessionPolicies(
                desktopSession as DesktopSessionPolicyTarget,
                currentOrigin,
              );
              await primaryBrowserWindow?.loadURL(
                `${currentOrigin}/?workspace=settings`,
              );
            },
          });
        },
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
      primaryBrowserWindow = browserWindow;
      primaryWebContents = browserWindow.webContents;
      installNavigationPolicy(
        browserWindow.webContents as unknown as DesktopNavigationTarget,
        {
          origin: () => currentOrigin,
          openExternal: (url) => shell.openExternal(url),
        },
      );
      browserWindow.once("ready-to-show", () => browserWindow.show());
      return {
        destroy: () => browserWindow.destroy(),
        load: () => browserWindow.loadURL(origin).then(() => undefined),
        requestClose: () => requestBrowserWindowClose(browserWindow),
        focus: () => browserWindow.focus(),
        isMinimized: () => browserWindow.isMinimized(),
        restore: () => browserWindow.restore(),
        onDimensionsChanged: (listener) => {
          browserWindow.on("resize", () => {
            const [width, height] = browserWindow.getSize();
            listener({ width, height });
          });
        },
        onClosed: (listener) => {
          const handleClosed = () => {
            primaryWebContents = null;
            listener();
          };
          if (browserWindow.isDestroyed()) queueMicrotask(handleClosed);
          else browserWindow.once("closed", handleClosed);
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
  if (activeDesktopLifecycle.launched)
    await desktopTools.cleanupOtherApplicationVersions();
}

const entrypoint = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (entrypoint && process.versions.electron) void runElectronDesktop();

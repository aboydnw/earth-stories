import { isAbsolute, relative, resolve, sep } from "node:path";
import type { PlatformPath } from "node:path";
import {
  CONVERSION_CAPABILITIES,
  type ConversionCapability,
} from "@earth-stories/story-schema";

const PROJECT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface DesktopIpcMain {
  handle(
    channel: string,
    handler: (event: unknown, ...args: unknown[]) => unknown,
  ): void;
}

export interface DesktopIpcService {
  resolveProjectDirectory(projectId: string): Promise<string>;
}

export interface DesktopShell {
  openExternal(url: string): Promise<void>;
  showItemInFolder(path: string): void;
}

export interface DesktopIpcDependencies {
  ipcMain: DesktopIpcMain;
  service: DesktopIpcService;
  shell: DesktopShell;
  projectsDirectory: string | (() => string);
  origin: string | (() => string);
  session: unknown;
  expectedWebContents(): DesktopIpcWebContents | null;
  chooseWorkspace(): Promise<string | null>;
  exportDiagnostics(): Promise<"exported" | "cancelled">;
  tools?: {
    listInstalled(): Promise<
      Array<{
        capability: string;
        apparentBytes: number;
        destination: string;
      }>
    >;
    removeCapability(capability: ConversionCapability): Promise<void>;
    prepareCapabilities(capabilities: ConversionCapability[]): Promise<
      Array<{
        capability: string;
        apparentBytes: number;
        destination: string;
      }>
    >;
  };
}

export interface DesktopIpcFrame {
  url: string;
}

export interface DesktopIpcWebContents {
  mainFrame: DesktopIpcFrame;
  session: unknown;
}

function requireNoArguments(method: string, args: unknown[]): void {
  if (args.length !== 0)
    throw new TypeError(`${method} does not accept arguments.`);
}

function requireProjectId(args: unknown[]): string {
  if (
    args.length !== 1 ||
    typeof args[0] !== "string" ||
    !PROJECT_ID.test(args[0])
  )
    throw new TypeError("A valid project identifier is required.");
  return args[0];
}

function requireExternalUrl(args: unknown[]): string {
  if (args.length !== 1 || typeof args[0] !== "string" || args[0] === "")
    throw new TypeError("A valid external URL is required.");
  let url: URL;
  try {
    url = new URL(args[0]);
  } catch {
    throw new TypeError("External links must use HTTP or HTTPS.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new TypeError("External links must use HTTP or HTTPS.");
  return url.href;
}

function requireCapability(args: unknown[]) {
  if (
    args.length !== 1 ||
    typeof args[0] !== "string" ||
    !(CONVERSION_CAPABILITIES as readonly string[]).includes(args[0])
  )
    throw new TypeError("A valid tool capability is required.");
  return args[0] as ConversionCapability;
}

function requireCapabilities(args: unknown[]) {
  if (
    args.length !== 1 ||
    !Array.isArray(args[0]) ||
    args[0].length === 0 ||
    args[0].length > 5
  )
    throw new TypeError("One or more valid tool capabilities are required.");
  let capabilities: ConversionCapability[];
  try {
    capabilities = args[0].map((value) => requireCapability([value]));
  } catch {
    throw new TypeError("One or more valid tool capabilities are required.");
  }
  if (new Set(capabilities).size !== capabilities.length)
    throw new TypeError("Tool capabilities must be unique.");
  return capabilities;
}

export function isContainedProjectPath(
  root: string,
  candidate: string,
  pathApi: Pick<PlatformPath, "isAbsolute" | "relative" | "resolve" | "sep"> = {
    isAbsolute,
    relative,
    resolve,
    sep,
  },
): boolean {
  if (!pathApi.isAbsolute(candidate)) return false;
  const path = pathApi.relative(
    pathApi.resolve(root),
    pathApi.resolve(candidate),
  );
  return (
    path !== "" &&
    !pathApi.isAbsolute(path) &&
    !path.startsWith(`..${pathApi.sep}`) &&
    path !== ".."
  );
}

function requireAuthorizedSender(
  event: unknown,
  dependencies: DesktopIpcDependencies,
): void {
  if (typeof event !== "object" || event === null)
    throw new Error("IPC is restricted to the authorized desktop renderer.");
  const sender = "sender" in event ? event.sender : null;
  const senderFrame = "senderFrame" in event ? event.senderFrame : null;
  const expected = dependencies.expectedWebContents();
  if (
    expected === null ||
    sender !== expected ||
    senderFrame !== expected.mainFrame ||
    expected.session !== dependencies.session ||
    typeof senderFrame !== "object" ||
    senderFrame === null ||
    !("url" in senderFrame) ||
    typeof senderFrame.url !== "string"
  )
    throw new Error("IPC is restricted to the authorized desktop renderer.");
  try {
    const origin =
      typeof dependencies.origin === "function"
        ? dependencies.origin()
        : dependencies.origin;
    if (new URL(senderFrame.url).origin !== origin)
      throw new Error("origin mismatch");
  } catch {
    throw new Error("IPC is restricted to the authorized desktop renderer.");
  }
}

export function registerDesktopIpcHandlers(
  dependencies: DesktopIpcDependencies,
): void {
  dependencies.ipcMain.handle("desktop:choose-workspace", (event, ...args) => {
    requireAuthorizedSender(event, dependencies);
    requireNoArguments("chooseWorkspace", args);
    return dependencies.chooseWorkspace();
  });
  dependencies.ipcMain.handle(
    "desktop:export-diagnostics",
    (event, ...args) => {
      requireAuthorizedSender(event, dependencies);
      requireNoArguments("exportDiagnostics", args);
      return dependencies.exportDiagnostics();
    },
  );
  dependencies.ipcMain.handle("desktop:workspace-path", (event, ...args) => {
    requireAuthorizedSender(event, dependencies);
    requireNoArguments("workspacePath", args);
    return typeof dependencies.projectsDirectory === "function"
      ? dependencies.projectsDirectory()
      : dependencies.projectsDirectory;
  });
  dependencies.ipcMain.handle(
    "desktop:show-workspace-folder",
    (event, ...args) => {
      requireAuthorizedSender(event, dependencies);
      requireNoArguments("showWorkspaceFolder", args);
      dependencies.shell.showItemInFolder(
        typeof dependencies.projectsDirectory === "function"
          ? dependencies.projectsDirectory()
          : dependencies.projectsDirectory,
      );
    },
  );
  dependencies.ipcMain.handle(
    "desktop:show-project-folder",
    async (event, ...args) => {
      requireAuthorizedSender(event, dependencies);
      const projectId = requireProjectId(args);
      const projectDirectory =
        await dependencies.service.resolveProjectDirectory(projectId);
      if (
        !isContainedProjectPath(
          typeof dependencies.projectsDirectory === "function"
            ? dependencies.projectsDirectory()
            : dependencies.projectsDirectory,
          projectDirectory,
        )
      )
        throw new Error("The resolved project is outside the workspace.");
      dependencies.shell.showItemInFolder(projectDirectory);
    },
  );
  dependencies.ipcMain.handle(
    "desktop:open-external",
    async (event, ...args) => {
      requireAuthorizedSender(event, dependencies);
      await dependencies.shell.openExternal(requireExternalUrl(args));
    },
  );
  if (dependencies.tools) {
    dependencies.ipcMain.handle("desktop:list-tools", (event, ...args) => {
      requireAuthorizedSender(event, dependencies);
      requireNoArguments("listTools", args);
      return dependencies.tools!.listInstalled();
    });
    dependencies.ipcMain.handle(
      "desktop:prepare-tools",
      async (event, ...args) => {
        requireAuthorizedSender(event, dependencies);
        return dependencies.tools!.prepareCapabilities(
          requireCapabilities(args),
        );
      },
    );
    dependencies.ipcMain.handle(
      "desktop:remove-tool",
      async (event, ...args) => {
        requireAuthorizedSender(event, dependencies);
        await dependencies.tools!.removeCapability(requireCapability(args));
      },
    );
  }
}

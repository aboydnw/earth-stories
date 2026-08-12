import { isAbsolute, relative, resolve, sep } from "node:path";

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
  projectsDirectory: string;
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

function isContainedProjectPath(root: string, candidate: string): boolean {
  if (!isAbsolute(candidate)) return false;
  const path = relative(resolve(root), resolve(candidate));
  return path !== "" && !path.startsWith(`..${sep}`) && path !== "..";
}

export function registerDesktopIpcHandlers(
  dependencies: DesktopIpcDependencies,
): void {
  dependencies.ipcMain.handle("desktop:choose-workspace", (_event, ...args) => {
    requireNoArguments("chooseWorkspace", args);
    return null;
  });
  dependencies.ipcMain.handle(
    "desktop:show-project-folder",
    async (_event, ...args) => {
      const projectId = requireProjectId(args);
      const projectDirectory =
        await dependencies.service.resolveProjectDirectory(projectId);
      if (
        !isContainedProjectPath(
          dependencies.projectsDirectory,
          projectDirectory,
        )
      )
        throw new Error("The resolved project is outside the workspace.");
      dependencies.shell.showItemInFolder(projectDirectory);
    },
  );
  dependencies.ipcMain.handle(
    "desktop:open-external",
    async (_event, ...args) => {
      await dependencies.shell.openExternal(requireExternalUrl(args));
    },
  );
}

import { posix, win32 } from "node:path";

export interface DesktopPathEnvironment {
  isPackaged: boolean;
  applicationDirectory: string;
  resourcesDirectory: string;
  userDataDirectory: string;
  documentsDirectory: string;
  platform: NodeJS.Platform;
}

export interface DesktopPaths {
  serviceBundle: string;
  viewerDirectory: string;
  editorDirectory: string;
  conversionManifestDirectory: string;
  conversionWorkerDirectory: string;
  projectsDirectory: string;
  userDataDirectory: string;
  toolsDirectory: string;
  logsDirectory: string;
  credentialsFile: string;
  workspacePointerFile: string;
  windowPreferencesFile: string;
  pixiExecutable: string;
  pixiHome: string;
}

export function resolveDesktopPaths(
  environment: DesktopPathEnvironment,
): DesktopPaths {
  const path = environment.platform === "win32" ? win32 : posix;
  const resourceRoot = environment.isPackaged
    ? environment.resourcesDirectory
    : path.resolve(environment.applicationDirectory, "../..");
  const toolsDirectory = path.resolve(environment.userDataDirectory, "tools");

  return {
    serviceBundle: path.resolve(
      resourceRoot,
      "apps/local-service/dist/service.js",
    ),
    viewerDirectory: path.resolve(resourceRoot, "dist/viewer"),
    editorDirectory: path.resolve(resourceRoot, "dist/editor"),
    conversionManifestDirectory: environment.isPackaged
      ? path.resolve(resourceRoot, "conversion")
      : resourceRoot,
    conversionWorkerDirectory: path.resolve(resourceRoot, "conversion/worker"),
    projectsDirectory: path.resolve(
      environment.documentsDirectory,
      "Earth Stories",
    ),
    userDataDirectory: environment.userDataDirectory,
    toolsDirectory,
    logsDirectory: path.resolve(environment.userDataDirectory, "logs"),
    credentialsFile: path.resolve(
      environment.userDataDirectory,
      "credentials.json",
    ),
    workspacePointerFile: path.resolve(
      environment.userDataDirectory,
      "workspace.json",
    ),
    windowPreferencesFile: path.resolve(
      environment.userDataDirectory,
      "window.json",
    ),
    pixiExecutable: path.resolve(
      toolsDirectory,
      "bin",
      environment.platform === "win32" ? "pixi.exe" : "pixi",
    ),
    pixiHome: path.resolve(toolsDirectory, "pixi-home"),
  };
}

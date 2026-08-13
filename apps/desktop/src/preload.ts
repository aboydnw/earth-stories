import { contextBridge, ipcRenderer } from "electron";

export interface DesktopBridge {
  version: string;
  platform: NodeJS.Platform;
  chooseWorkspace(): Promise<string | null>;
  workspacePath(): Promise<string>;
  showWorkspaceFolder(): Promise<void>;
  showProjectFolder(projectId: string): Promise<void>;
  openExternal(url: string): Promise<void>;
}

const bridge: DesktopBridge = Object.freeze({
  version: process.env.npm_package_version ?? "0.1.0",
  platform: process.platform,
  chooseWorkspace: () => ipcRenderer.invoke("desktop:choose-workspace"),
  workspacePath: () => ipcRenderer.invoke("desktop:workspace-path"),
  showWorkspaceFolder: () =>
    ipcRenderer.invoke("desktop:show-workspace-folder"),
  showProjectFolder: (projectId: string) =>
    ipcRenderer.invoke("desktop:show-project-folder", projectId),
  openExternal: (url: string) =>
    ipcRenderer.invoke("desktop:open-external", url),
});

contextBridge.exposeInMainWorld("earthStoriesDesktop", bridge);

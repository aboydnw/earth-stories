import { contextBridge, ipcRenderer } from "electron";

export interface DesktopBridge {
  version: string;
  platform: NodeJS.Platform;
  chooseWorkspace(): Promise<string | null>;
  showProjectFolder(projectId: string): Promise<void>;
  openExternal(url: string): Promise<void>;
}

const bridge: DesktopBridge = Object.freeze({
  version: process.env.npm_package_version ?? "0.1.0",
  platform: process.platform,
  chooseWorkspace: () => ipcRenderer.invoke("desktop:choose-workspace"),
  showProjectFolder: (projectId: string) =>
    ipcRenderer.invoke("desktop:show-project-folder", projectId),
  openExternal: (url: string) =>
    ipcRenderer.invoke("desktop:open-external", url),
});

contextBridge.exposeInMainWorld("earthStoriesDesktop", bridge);

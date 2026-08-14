import { contextBridge, ipcRenderer } from "electron";
import type { ConversionCapability } from "@earth-stories/story-schema";

declare const __EARTH_STORIES_VERSION__: string;

export interface DesktopBridge {
  version: string;
  platform: NodeJS.Platform;
  chooseWorkspace(): Promise<string | null>;
  exportDiagnostics(): Promise<"exported" | "cancelled">;
  workspacePath(): Promise<string>;
  showWorkspaceFolder(): Promise<void>;
  showProjectFolder(projectId: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  listTools(): Promise<
    Array<{
      capability: string;
      apparentBytes: number;
      destination: string;
    }>
  >;
  prepareTools(capabilities: ConversionCapability[]): Promise<
    Array<{
      capability: string;
      apparentBytes: number;
      destination: string;
    }>
  >;
  removeTool(capability: string): Promise<void>;
}

const bridge: DesktopBridge = Object.freeze({
  version:
    typeof __EARTH_STORIES_VERSION__ === "string"
      ? __EARTH_STORIES_VERSION__
      : "0.1.0",
  platform: process.platform,
  chooseWorkspace: () => ipcRenderer.invoke("desktop:choose-workspace"),
  exportDiagnostics: () => ipcRenderer.invoke("desktop:export-diagnostics"),
  workspacePath: () => ipcRenderer.invoke("desktop:workspace-path"),
  showWorkspaceFolder: () =>
    ipcRenderer.invoke("desktop:show-workspace-folder"),
  showProjectFolder: (projectId: string) =>
    ipcRenderer.invoke("desktop:show-project-folder", projectId),
  openExternal: (url: string) =>
    ipcRenderer.invoke("desktop:open-external", url),
  listTools: () => ipcRenderer.invoke("desktop:list-tools"),
  prepareTools: (capabilities: ConversionCapability[]) =>
    ipcRenderer.invoke("desktop:prepare-tools", capabilities),
  removeTool: (capability: string) =>
    ipcRenderer.invoke("desktop:remove-tool", capability),
});

contextBridge.exposeInMainWorld("earthStoriesDesktop", bridge);

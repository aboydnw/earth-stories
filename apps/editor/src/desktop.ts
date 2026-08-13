export type DesktopPlatform =
  | "aix"
  | "android"
  | "darwin"
  | "freebsd"
  | "haiku"
  | "linux"
  | "openbsd"
  | "sunos"
  | "win32"
  | "cygwin"
  | "netbsd";

export interface DesktopBridge {
  version: string;
  platform: DesktopPlatform;
  chooseWorkspace(): Promise<string | null>;
  workspacePath(): Promise<string>;
  showWorkspaceFolder(): Promise<void>;
  showProjectFolder(projectId: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  listTools(): Promise<InstalledDesktopTool[]>;
  removeTool(capability: string): Promise<void>;
}

export interface InstalledDesktopTool {
  capability: string;
  bytes: number;
  destination: string;
}

declare global {
  interface Window {
    earthStoriesDesktop?: DesktopBridge;
  }
}

export function detectDesktopBridge(): DesktopBridge | null {
  return typeof window === "undefined"
    ? null
    : (window.earthStoriesDesktop ?? null);
}

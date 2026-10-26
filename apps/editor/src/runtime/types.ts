import type { DesktopBridge } from "../desktop";

export interface RuntimeCapabilities {
  projectWorkspace: boolean;
  nativeConversion: boolean;
  protectedCredentials: boolean;
  folderPublication: boolean;
  githubPagesPublishing: boolean;
  nativeDialogs: boolean;
}

export type AuthoringRuntime =
  | {
      kind: "desktop";
      capabilities: RuntimeCapabilities;
      desktop: DesktopBridge;
    }
  | {
      kind: "development-loopback" | "hosted-browser";
      capabilities: RuntimeCapabilities;
      desktop: null;
    };


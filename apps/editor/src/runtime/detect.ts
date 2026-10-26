import type { DesktopBridge } from "../desktop";
import type { AuthoringRuntime, RuntimeCapabilities } from "./types";

interface RuntimeWindow {
  location: Pick<URL, "protocol" | "hostname">;
  earthStoriesDesktop?: DesktopBridge;
}

const enabled: RuntimeCapabilities = {
  projectWorkspace: true,
  nativeConversion: true,
  protectedCredentials: true,
  folderPublication: true,
  githubPagesPublishing: true,
  nativeDialogs: true,
};

const unavailable: RuntimeCapabilities = {
  projectWorkspace: false,
  nativeConversion: false,
  protectedCredentials: false,
  folderPublication: false,
  githubPagesPublishing: false,
  nativeDialogs: false,
};

export function detectAuthoringRuntime(target: RuntimeWindow): AuthoringRuntime {
  if (target.earthStoriesDesktop)
    return {
      kind: "desktop",
      desktop: target.earthStoriesDesktop,
      capabilities: { ...enabled },
    };

  const loopback =
    target.location.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(target.location.hostname);
  if (loopback)
    return {
      kind: "development-loopback",
      desktop: null,
      capabilities: {
        ...enabled,
        protectedCredentials: false,
        nativeDialogs: false,
      },
    };

  return {
    kind: "hosted-browser",
    desktop: null,
    capabilities: { ...unavailable },
  };
}

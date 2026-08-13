// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { detectDesktopBridge, type DesktopBridge } from "./desktop";

afterEach(() => {
  delete window.earthStoriesDesktop;
});

describe("detectDesktopBridge", () => {
  it("returns null when the editor runs in a browser", () => {
    expect(detectDesktopBridge()).toBeNull();
  });

  it("returns the bridge exposed by the desktop preload", () => {
    const bridge = {
      version: "9.8.7",
      platform: "linux",
      chooseWorkspace: async () => null,
      exportDiagnostics: async () => "cancelled",
      workspacePath: async () => "/documents/Earth Stories",
      showWorkspaceFolder: async () => undefined,
      showProjectFolder: async () => undefined,
      openExternal: async () => undefined,
      listTools: async () => [],
      removeTool: async () => undefined,
    } satisfies DesktopBridge;
    window.earthStoriesDesktop = bridge;

    expect(detectDesktopBridge()).toBe(bridge);
  });
});

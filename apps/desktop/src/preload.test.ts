import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: { invoke: electron.invoke },
}));

import "./preload.js";

describe("desktop preload bridge", () => {
  beforeEach(() => {
    electron.invoke.mockReset();
  });

  it("exposes exactly the seven approved desktop capabilities", () => {
    expect(electron.exposeInMainWorld).toHaveBeenCalledOnce();
    const [name, bridge] = electron.exposeInMainWorld.mock.calls[0] ?? [];

    expect(name).toBe("earthStoriesDesktop");
    expect(Object.keys(bridge).sort()).toEqual([
      "chooseWorkspace",
      "openExternal",
      "platform",
      "showProjectFolder",
      "showWorkspaceFolder",
      "version",
      "workspacePath",
    ]);
    expect(typeof bridge.version).toBe("string");
    expect(bridge.platform).toBe(process.platform);
  });

  it("maps each method to one fixed IPC channel", async () => {
    electron.invoke
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("/documents/Earth Stories")
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const bridge = electron.exposeInMainWorld.mock.calls[0]?.[1];

    await expect(bridge.chooseWorkspace()).resolves.toBeNull();
    await expect(bridge.workspacePath()).resolves.toBe(
      "/documents/Earth Stories",
    );
    await expect(bridge.showWorkspaceFolder()).resolves.toBeUndefined();
    await expect(
      bridge.showProjectFolder("project-one"),
    ).resolves.toBeUndefined();
    await expect(
      bridge.openExternal("https://example.com/help"),
    ).resolves.toBeUndefined();

    expect(electron.invoke.mock.calls).toEqual([
      ["desktop:choose-workspace"],
      ["desktop:workspace-path"],
      ["desktop:show-workspace-folder"],
      ["desktop:show-project-folder", "project-one"],
      ["desktop:open-external", "https://example.com/help"],
    ]);
  });
});

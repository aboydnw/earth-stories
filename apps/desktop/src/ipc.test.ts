import { describe, expect, it, vi } from "vitest";
import { registerDesktopIpcHandlers } from "./ipc.js";

function harness(
  resolveProjectDirectory: (projectId: string) => Promise<string> = async (
    projectId,
  ) => `/documents/Earth Stories/${projectId}`,
) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const openExternal = vi.fn(async () => undefined);
  const showItemInFolder = vi.fn();
  registerDesktopIpcHandlers({
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler),
    },
    service: { resolveProjectDirectory },
    shell: { openExternal, showItemInFolder },
    projectsDirectory: "/documents/Earth Stories",
  });
  const invoke = async (channel: string, ...args: unknown[]) => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`missing handler ${channel}`);
    return await handler({}, ...args);
  };
  return { handlers, invoke, openExternal, showItemInFolder };
}

describe("desktop IPC", () => {
  it("registers one fixed handler per bridge method", () => {
    expect([...harness().handlers.keys()].sort()).toEqual([
      "desktop:choose-workspace",
      "desktop:open-external",
      "desktop:show-project-folder",
    ]);
  });

  it("keeps workspace selection stubbed and rejects unexpected input", async () => {
    const value = harness();

    await expect(value.invoke("desktop:choose-workspace")).resolves.toBeNull();
    await expect(
      value.invoke("desktop:choose-workspace", "/host/chosen/path"),
    ).rejects.toThrow("chooseWorkspace");
  });

  it.each([
    [[]],
    [[undefined]],
    [[null]],
    [[17]],
    [[""]],
    [["../outside"]],
    [["ok", "extra"]],
  ])("rejects malformed showProjectFolder arguments %j", async (args) => {
    const value = harness();
    await expect(
      value.invoke("desktop:show-project-folder", ...args),
    ).rejects.toThrow("project identifier");
    expect(value.showItemInFolder).not.toHaveBeenCalled();
  });

  it("resolves a project through the service before revealing it", async () => {
    const resolveProjectDirectory = vi.fn(async () =>
      Promise.resolve("/documents/Earth Stories/project-one"),
    );
    const value = harness(resolveProjectDirectory);

    await expect(
      value.invoke("desktop:show-project-folder", "project-one"),
    ).resolves.toBeUndefined();
    expect(resolveProjectDirectory).toHaveBeenCalledWith("project-one");
    expect(value.showItemInFolder).toHaveBeenCalledWith(
      "/documents/Earth Stories/project-one",
    );
  });

  it("refuses a service-resolved path outside the workspace", async () => {
    const value = harness(async () => "/documents/stolen-project");

    await expect(
      value.invoke("desktop:show-project-folder", "project-one"),
    ).rejects.toThrow("outside the workspace");
    expect(value.showItemInFolder).not.toHaveBeenCalled();
  });

  it.each([
    [[]],
    [[undefined]],
    [[null]],
    [[17]],
    [[""]],
    [["https://safe.test", "extra"]],
  ])("rejects malformed openExternal arguments %j", async (args) => {
    const value = harness();
    await expect(
      value.invoke("desktop:open-external", ...args),
    ).rejects.toThrow("external URL");
    expect(value.openExternal).not.toHaveBeenCalled();
  });

  it.each([
    "file:///documents/Earth%20Stories/story.json",
    "earth-stories://project/project-one",
    "javascript:alert(1)",
    "not a url",
  ])("refuses the external URL %s", async (url) => {
    const value = harness();

    await expect(value.invoke("desktop:open-external", url)).rejects.toThrow(
      "HTTP or HTTPS",
    );
    expect(value.openExternal).not.toHaveBeenCalled();
  });

  it("opens a validated HTTPS URL in the system browser", async () => {
    const value = harness();

    await expect(
      value.invoke("desktop:open-external", "https://example.com/help?q=1"),
    ).resolves.toBeUndefined();
    expect(value.openExternal).toHaveBeenCalledWith(
      "https://example.com/help?q=1",
    );
  });
});

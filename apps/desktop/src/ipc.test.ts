import { describe, expect, it, vi } from "vitest";
import { registerDesktopIpcHandlers } from "./ipc.js";

function harness(
  resolveProjectDirectory: (projectId: string) => Promise<string> = async (
    projectId,
  ) => `/documents/Earth Stories/${projectId}`,
  identity: {
    origin?: string;
    frameUrl?: string;
    expectedSession?: object;
    webContentsSession?: object;
  } = {},
) {
  const origin = identity.origin ?? "http://127.0.0.1:45123";
  const expectedSession = identity.expectedSession ?? {
    name: "desktop-session",
  };
  const webContentsSession = identity.webContentsSession ?? expectedSession;
  const mainFrame = { url: identity.frameUrl ?? `${origin}/projects` };
  const webContents = { mainFrame, session: webContentsSession };
  const validEvent = { sender: webContents, senderFrame: mainFrame };
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const openExternal = vi.fn(async () => undefined);
  const showItemInFolder = vi.fn();
  const resolveProject = vi.fn(resolveProjectDirectory);
  registerDesktopIpcHandlers({
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler),
    },
    service: { resolveProjectDirectory: resolveProject },
    shell: { openExternal, showItemInFolder },
    projectsDirectory: "/documents/Earth Stories",
    origin,
    session: expectedSession,
    expectedWebContents: () => webContents,
  });
  const invokeWithEvent = async (
    event: unknown,
    channel: string,
    ...args: unknown[]
  ) => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`missing handler ${channel}`);
    return await handler(event, ...args);
  };
  const invoke = (channel: string, ...args: unknown[]) =>
    invokeWithEvent(validEvent, channel, ...args);
  return {
    expectedSession,
    handlers,
    invoke,
    invokeWithEvent,
    mainFrame,
    openExternal,
    resolveProject,
    showItemInFolder,
    validEvent,
    webContents,
  };
}

describe("desktop IPC", () => {
  const authorizedCalls = [
    ["desktop:choose-workspace", []],
    ["desktop:show-project-folder", ["project-one"]],
    ["desktop:open-external", ["https://example.com/help"]],
  ] as const;

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

  it.each(authorizedCalls)(
    "rejects absent sender identity on %s",
    async (channel, args) => {
      const value = harness();

      await expect(
        value.invokeWithEvent(undefined, channel, ...args),
      ).rejects.toThrow("authorized desktop renderer");
      expect(value.resolveProject).not.toHaveBeenCalled();
      expect(value.showItemInFolder).not.toHaveBeenCalled();
      expect(value.openExternal).not.toHaveBeenCalled();
    },
  );

  it.each(authorizedCalls)(
    "rejects an absent sender frame on %s",
    async (channel, args) => {
      const value = harness();

      await expect(
        value.invokeWithEvent(
          { sender: value.webContents, senderFrame: null },
          channel,
          ...args,
        ),
      ).rejects.toThrow("authorized desktop renderer");
      expect(value.resolveProject).not.toHaveBeenCalled();
      expect(value.openExternal).not.toHaveBeenCalled();
    },
  );

  it.each(authorizedCalls)(
    "rejects a different same-origin sender frame on %s",
    async (channel, args) => {
      const value = harness();
      const unexpectedFrame = {
        url: "http://127.0.0.1:45123/projects",
      };

      await expect(
        value.invokeWithEvent(
          { sender: value.webContents, senderFrame: unexpectedFrame },
          channel,
          ...args,
        ),
      ).rejects.toThrow("authorized desktop renderer");
      expect(value.resolveProject).not.toHaveBeenCalled();
      expect(value.showItemInFolder).not.toHaveBeenCalled();
      expect(value.openExternal).not.toHaveBeenCalled();
    },
  );

  it.each(authorizedCalls)(
    "rejects a mismatched sender origin on %s",
    async (channel, args) => {
      const value = harness(undefined, {
        frameUrl: "http://127.0.0.1:45124/steal",
      });

      await expect(value.invoke(channel, ...args)).rejects.toThrow(
        "authorized desktop renderer",
      );
      expect(value.resolveProject).not.toHaveBeenCalled();
      expect(value.openExternal).not.toHaveBeenCalled();
    },
  );

  it.each(authorizedCalls)(
    "rejects an unexpected webContents on %s",
    async (channel, args) => {
      const value = harness();
      const unexpected = {
        mainFrame: value.mainFrame,
        session: value.expectedSession,
      };

      await expect(
        value.invokeWithEvent(
          { sender: unexpected, senderFrame: value.mainFrame },
          channel,
          ...args,
        ),
      ).rejects.toThrow("authorized desktop renderer");
      expect(value.resolveProject).not.toHaveBeenCalled();
      expect(value.openExternal).not.toHaveBeenCalled();
    },
  );

  it.each(authorizedCalls)(
    "rejects an unexpected session on %s",
    async (channel, args) => {
      const value = harness(undefined, {
        webContentsSession: { name: "other-session" },
      });

      await expect(value.invoke(channel, ...args)).rejects.toThrow(
        "authorized desktop renderer",
      );
      expect(value.resolveProject).not.toHaveBeenCalled();
      expect(value.openExternal).not.toHaveBeenCalled();
    },
  );

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

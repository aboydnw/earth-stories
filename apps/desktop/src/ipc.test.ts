import { describe, expect, it, vi } from "vitest";
import {
  registerDesktopIpcHandlers,
  type DesktopIpcDependencies,
} from "./ipc.js";

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
  tools?: DesktopIpcDependencies["tools"],
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
  const chooseWorkspace = vi.fn(async () => "/documents/Another Workspace");
  const exportDiagnostics = vi.fn(async () => "exported" as const);
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
    chooseWorkspace,
    exportDiagnostics,
    tools,
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
    chooseWorkspace,
    exportDiagnostics,
    resolveProject,
    showItemInFolder,
    validEvent,
    webContents,
  };
}

describe("desktop IPC", () => {
  const authorizedCalls = [
    ["desktop:choose-workspace", []],
    ["desktop:workspace-path", []],
    ["desktop:show-workspace-folder", []],
    ["desktop:show-project-folder", ["project-one"]],
    ["desktop:open-external", ["https://example.com/help"]],
    ["desktop:export-diagnostics", []],
  ] as const;

  it("registers one fixed handler per bridge method", () => {
    expect([...harness().handlers.keys()].sort()).toEqual([
      "desktop:choose-workspace",
      "desktop:export-diagnostics",
      "desktop:open-external",
      "desktop:show-project-folder",
      "desktop:show-workspace-folder",
      "desktop:workspace-path",
    ]);
  });

  it("exports diagnostics through one argument-free authorized action", async () => {
    const value = harness();

    await expect(value.invoke("desktop:export-diagnostics")).resolves.toBe(
      "exported",
    );
    expect(value.exportDiagnostics).toHaveBeenCalledOnce();
    await expect(
      value.invoke("desktop:export-diagnostics", "/renderer/chosen/path"),
    ).rejects.toThrow("exportDiagnostics");
  });

  it("changes workspace through the authorized lifecycle and rejects unexpected input", async () => {
    const value = harness();

    await expect(value.invoke("desktop:choose-workspace")).resolves.toBe(
      "/documents/Another Workspace",
    );
    expect(value.chooseWorkspace).toHaveBeenCalledOnce();
    await expect(
      value.invoke("desktop:choose-workspace", "/host/chosen/path"),
    ).rejects.toThrow("chooseWorkspace");
  });

  it("returns and reveals only the configured workspace path", async () => {
    const value = harness();

    await expect(value.invoke("desktop:workspace-path")).resolves.toBe(
      "/documents/Earth Stories",
    );
    await expect(
      value.invoke("desktop:show-workspace-folder"),
    ).resolves.toBeUndefined();
    expect(value.showItemInFolder).toHaveBeenCalledWith(
      "/documents/Earth Stories",
    );
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

  it("prepares only validated pinned tool capabilities", async () => {
    const listInstalled = vi.fn(async () => []);
    const prepareCapabilities = vi.fn(async () => []);
    const removeCapability = vi.fn(async () => undefined);
    const value = harness(
      undefined,
      {},
      {
        listInstalled,
        prepareCapabilities,
        removeCapability,
      },
    );

    await expect(
      value.invoke("desktop:prepare-tools", ["raster", "vector"]),
    ).resolves.toEqual([]);
    expect(prepareCapabilities).toHaveBeenCalledWith(["raster", "vector"]);
    await expect(
      value.invoke("desktop:prepare-tools", ["raster", "../outside"]),
    ).rejects.toThrow(/tool capabilities/i);
    await expect(
      value.invoke("desktop:prepare-tools", ["raster", "raster"]),
    ).rejects.toThrow(/tool capabilities/i);
    prepareCapabilities.mockClear();
    await expect(
      value.invokeWithEvent(undefined, "desktop:prepare-tools", ["raster"]),
    ).rejects.toThrow("authorized desktop renderer");
    expect(prepareCapabilities).not.toHaveBeenCalled();
  });
});

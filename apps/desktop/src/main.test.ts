import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { DesktopPaths } from "./paths.js";
import {
  capabilityRequestHeaders,
  changeDesktopWorkspace,
  createDimensionPersistence,
  createEphemeralSessionPartition,
  exportDesktopDiagnostics,
  launchDesktopMain,
  readWindowDimensions,
  requestBrowserWindowClose,
  requireServiceOrigin,
  writeWindowDimensions,
  type DesktopMainDependencies,
  type QuitEvent,
} from "./main.js";

const paths: DesktopPaths = {
  serviceBundle: "/resources/apps/local-service/dist/service.js",
  viewerDirectory: "/resources/dist/viewer",
  editorDirectory: "/resources/dist/editor",
  conversionManifestDirectory: "/resources",
  conversionWorkerDirectory: "/resources/conversion/worker",
  projectsDirectory: "/documents/Earth Stories",
  userDataDirectory: "/profile",
  toolsDirectory: "/profile/tools",
  logsDirectory: "/profile/logs",
  credentialsFile: "/profile/credentials.json",
  workspacePointerFile: "/profile/workspace.json",
  windowPreferencesFile: "/profile/window.json",
  pixiExecutable: "/profile/tools/bin/pixi",
  pixiHome: "/profile/tools/pixi-home",
};

describe("exportDesktopDiagnostics", () => {
  it("reveals an exported file without returning its path", async () => {
    const exportTo = vi.fn(async () => undefined);
    const reveal = vi.fn();

    await expect(
      exportDesktopDiagnostics({
        chooseDestination: async () => "/exports/earth-stories.json",
        exportTo,
        reveal,
      }),
    ).resolves.toBe("exported");

    expect(exportTo).toHaveBeenCalledWith("/exports/earth-stories.json");
    expect(reveal).toHaveBeenCalledWith("/exports/earth-stories.json");
  });

  it("does nothing when the author cancels the destination dialog", async () => {
    const exportTo = vi.fn(async () => undefined);
    const reveal = vi.fn();

    await expect(
      exportDesktopDiagnostics({
        chooseDestination: async () => null,
        exportTo,
        reveal,
      }),
    ).resolves.toBe("cancelled");
    expect(exportTo).not.toHaveBeenCalled();
    expect(reveal).not.toHaveBeenCalled();
  });
});

function harness(
  options: {
    lock?: boolean;
    startError?: Error;
    shutdownError?: Error;
    launchArguments?: string[];
    origin?: string;
    hookError?: Error;
    probeError?: Error;
    loadError?: Error;
    deferredLoad?: boolean;
    closeAllowed?: boolean;
    probeWaitsForAbort?: boolean;
  } = {},
) {
  const events: string[] = [];
  let secondInstance: ((argv: string[]) => void) | undefined;
  let openFile: ((path: string) => void) | undefined;
  let beforeQuit: ((event: QuitEvent) => void) | undefined;
  let startupErrorClosed: (() => void) | undefined;
  let windowClosed: (() => void) | undefined;
  let resolveWindowLoad: (() => void) | undefined;
  let rejectWindowLoad: ((cause: Error) => void) | undefined;
  const windowLoad = options.deferredLoad
    ? new Promise<void>((resolve, reject) => {
        resolveWindowLoad = resolve;
        rejectWindowLoad = reject;
      })
    : null;
  let dimensionsChanged:
    ((dimensions: { width: number; height: number }) => void) | undefined;
  const dependencies: DesktopMainDependencies = {
    paths,
    launchArguments: options.launchArguments ?? ["electron", "app"],
    app: {
      requestSingleInstanceLock: () => options.lock ?? true,
      whenReady: async () => events.push("ready"),
      quit: () => events.push("quit"),
      onSecondInstance: (listener) => {
        secondInstance = listener;
      },
      onOpenFile: (listener) => {
        openFile = listener;
      },
      onBeforeQuit: (listener) => {
        beforeQuit = listener;
      },
    },
    service: {
      capabilityToken: "launch-secret",
      start: async () => {
        events.push("service:start");
        if (options.startError) throw options.startError;
        return options.origin ?? "http://127.0.0.1:45123";
      },
      shutdown: async () => {
        events.push("service:shutdown");
        if (options.shutdownError) throw options.shutdownError;
      },
    },
    createSession: () => {
      events.push("session:create");
      return { name: "desktop-session" };
    },
    installHeaderHook: () => {
      events.push("session:hook");
      if (options.hookError) throw options.hookError;
    },
    installSessionPolicies: () => events.push("session:policies"),
    probeSession: async (_session, probeOptions) => {
      events.push("session:probe");
      if (options.probeError) throw options.probeError;
      if (options.probeWaitsForAbort) {
        const signal = (probeOptions as { signal?: AbortSignal }).signal;
        if (!signal) throw new Error("probe did not receive an abort signal");
        await new Promise<void>((_resolve, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new Error("startup probe timed out")),
            { once: true },
          ),
        );
      }
    },
    installIpcHandlers: (...args: unknown[]) => {
      const options = args[0] as
        { origin?: string; session?: { name?: string } } | undefined;
      events.push(`ipc:handlers:${options?.origin}:${options?.session?.name}`);
    },
    createWindow: ({ dimensions }) => {
      events.push(`window:create:${dimensions.width}x${dimensions.height}`);
      return {
        destroy: () => {
          events.push("window:destroy");
          windowClosed?.();
        },
        load: async () => {
          events.push("window:load");
          if (options.loadError) throw options.loadError;
          if (windowLoad) await windowLoad;
        },
        requestClose: async () => {
          events.push("window:request-close");
          const allowed = options.closeAllowed ?? true;
          if (allowed) windowClosed?.();
          return allowed;
        },
        focus: () => events.push("window:focus"),
        isMinimized: () => true,
        restore: () => events.push("window:restore"),
        onDimensionsChanged: (listener) => {
          dimensionsChanged = listener;
        },
        onClosed: (listener) => {
          windowClosed = listener;
        },
      };
    },
    createStartupErrorWindow: ({ message, logsDirectory }) => {
      events.push(`error:${message}:${logsDirectory}`);
      return {
        onClosed: (listener: () => void) => {
          startupErrorClosed = listener;
        },
      };
    },
    queueFileArgument: (path) => events.push(`file:${path}`),
    readDimensions: async () => ({ width: 1111, height: 777 }),
    writeDimensions: async (_path, dimensions) =>
      events.push(`dimensions:${dimensions.width}x${dimensions.height}`),
  };
  return {
    dependencies,
    events,
    secondInstance: () => secondInstance,
    openFile: () => openFile,
    beforeQuit: () => beforeQuit,
    startupErrorClosed: () => startupErrorClosed,
    dimensionsChanged: () => dimensionsChanged,
    closeWindow: () => windowClosed?.(),
    resolveWindowLoad: () => resolveWindowLoad?.(),
    rejectWindowLoad: (cause: Error) => rejectWindowLoad?.(cause),
  };
}

describe("launchDesktopMain", () => {
  it("quits without starting work when another instance owns the lock", async () => {
    const value = harness({ lock: false });

    await launchDesktopMain(value.dependencies);

    expect(value.events).toEqual(["quit"]);
  });

  it("starts the service, session, header hook, and window in order", async () => {
    const value = harness();

    await launchDesktopMain(value.dependencies);

    expect(value.events).toEqual([
      "ready",
      "service:start",
      "session:create",
      "session:hook",
      "session:policies",
      "session:probe",
      "ipc:handlers:http://127.0.0.1:45123:desktop-session",
      "window:create:1111x777",
      "window:load",
    ]);
  });

  it("queues every project passed to the first launch", async () => {
    const value = harness({
      launchArguments: [
        "electron",
        "app",
        "/stories/map.earthstory",
        "--ignored",
        "/stories/atlas.earthstory",
      ],
    });

    await launchDesktopMain(value.dependencies);

    expect(value.events.filter((event) => event.startsWith("file:"))).toEqual([
      "file:/stories/map.earthstory",
      "file:/stories/atlas.earthstory",
    ]);
  });

  it("focuses the window and queues every file from a later launch", async () => {
    const value = harness();
    await launchDesktopMain(value.dependencies);

    value.secondInstance()?.([
      "electron",
      "app",
      "/stories/map.earthstory",
      "/stories/atlas.earthstory",
    ]);

    expect(value.events.slice(-4)).toEqual([
      "file:/stories/map.earthstory",
      "file:/stories/atlas.earthstory",
      "window:restore",
      "window:focus",
    ]);
  });

  it("queues projects received through the operating-system open-file event", async () => {
    const value = harness();
    await launchDesktopMain(value.dependencies);

    value.openFile()?.("/stories/finder.earthstory");

    expect(value.events.at(-1)).toBe("file:/stories/finder.earthstory");
  });

  it("shows the typed startup message and logs location", async () => {
    const value = harness({
      startError: Object.assign(new Error("The viewer files are missing."), {
        code: "missing-viewer-directory",
      }),
    });

    await launchDesktopMain(value.dependencies);

    expect(value.events).toEqual([
      "ready",
      "service:start",
      "error:The viewer files are missing.:/profile/logs",
    ]);
  });

  it("retains the startup-error window until it closes", async () => {
    const value = harness({ startError: new Error("Service unavailable") });

    const lifecycle = await launchDesktopMain(value.dependencies);

    expect(lifecycle.startupErrorWindow).not.toBeNull();
    value.startupErrorClosed()?.();
    expect(lifecycle.startupErrorWindow).toBeNull();
  });

  it("asks the renderer to close before draining the service", async () => {
    const value = harness();
    await launchDesktopMain(value.dependencies);
    const quitEvent = { preventDefault: () => value.events.push("prevent") };

    value.beforeQuit()?.(quitEvent);
    value.beforeQuit()?.(quitEvent);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(value.events.slice(-5)).toEqual([
      "prevent",
      "window:request-close",
      "prevent",
      "service:shutdown",
      "quit",
    ]);
  });

  it("keeps the service alive when unsaved renderer state vetoes quit", async () => {
    const value = harness({ closeAllowed: false });
    await launchDesktopMain(value.dependencies);

    value.beforeQuit()?.({
      preventDefault: () => value.events.push("prevent"),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    value.beforeQuit()?.({
      preventDefault: () => value.events.push("prevent"),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      value.events.filter((event) => event === "window:request-close"),
    ).toHaveLength(2);
    expect(value.events).not.toContain("service:shutdown");
    expect(value.events).not.toContain("quit");
  });

  it("drains the service and quits exactly once after a direct window close", async () => {
    const value = harness();
    await launchDesktopMain(value.dependencies);

    value.closeWindow();
    value.beforeQuit()?.({
      preventDefault: () => value.events.push("prevent"),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      value.events.filter((event) => event === "service:shutdown"),
    ).toHaveLength(1);
    expect(value.events.filter((event) => event === "quit")).toHaveLength(1);
    expect(value.events).not.toContain("window:request-close");
  });

  it("does not focus a window after it has closed", async () => {
    const value = harness();
    await launchDesktopMain(value.dependencies);

    value.closeWindow();
    value.secondInstance()?.([
      "electron",
      "app",
      "/stories/after-close.earthstory",
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(value.events).toContain("file:/stories/after-close.earthstory");
    expect(value.events).not.toContain("window:focus");
    expect(value.events).not.toContain("window:restore");
  });

  it.each(["resolve", "reject"] as const)(
    "lets a direct close own shutdown while startup load later %ss",
    async (settlement) => {
      const value = harness({ deferredLoad: true });
      const launching = launchDesktopMain(value.dependencies);
      await new Promise((resolve) => setTimeout(resolve, 0));

      value.closeWindow();
      value.secondInstance()?.(["electron", "app"]);
      if (settlement === "resolve") value.resolveWindowLoad();
      else value.rejectWindowLoad(new Error("load settled after close"));
      await launching;
      value.beforeQuit()?.({
        preventDefault: () => value.events.push("prevent"),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(value.events).not.toContain("window:focus");
      expect(value.events).not.toContain("window:restore");
      expect(value.events).not.toContain("window:request-close");
      expect(
        value.events.filter((event) => event === "service:shutdown"),
      ).toHaveLength(1);
      expect(value.events.filter((event) => event === "quit")).toHaveLength(1);
      expect(
        value.events.filter((event) => event.startsWith("error:")),
      ).toEqual([]);
    },
  );

  it("keeps a controlled startup load failure on the startup-error path", async () => {
    const value = harness({ loadError: new Error("load failed") });

    await launchDesktopMain(value.dependencies);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      value.events.filter((event) => event === "service:shutdown"),
    ).toHaveLength(1);
    expect(value.events).toContain("window:destroy");
    expect(value.events).toContain("error:load failed:/profile/logs");
    expect(value.events).not.toContain("quit");
  });

  it("finishes quitting when service cleanup reports an error", async () => {
    const value = harness({ shutdownError: new Error("close failed") });
    await launchDesktopMain(value.dependencies);

    value.beforeQuit()?.({
      preventDefault: () => value.events.push("prevent"),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(value.events.slice(-4)).toEqual([
      "prevent",
      "window:request-close",
      "service:shutdown",
      "quit",
    ]);
  });

  it("persists changed window dimensions through the dimensions-only writer", async () => {
    const value = harness();
    await launchDesktopMain(value.dependencies);

    value.dimensionsChanged()?.({ width: 1280, height: 900 });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(value.events.at(-1)).toBe("dimensions:1280x900");
  });

  it.each([
    "http://localhost:45123",
    "http://[::1]:45123",
    "https://127.0.0.1:45123",
    "http://127.0.0.1",
    "http://127.0.0.1:0",
    "http://127.0.0.1:45123/path",
    "http://127.0.0.1:45123/?query=1",
    "http://127.0.0.1:45123/#fragment",
    "http://user:pass@127.0.0.1:45123",
  ])(
    "rejects hostile service origin %s before session creation",
    async (origin) => {
      const value = harness({ origin });

      await launchDesktopMain(value.dependencies);

      expect(value.events).toEqual([
        "ready",
        "service:start",
        "service:shutdown",
        "error:The local service reported an invalid origin.:/profile/logs",
      ]);
    },
  );

  it.each(["hook", "probe", "load"] as const)(
    "closes service and shows startup error when %s fails",
    async (stage) => {
      const failure = new Error(`${stage} failed`);
      const value = harness({
        hookError: stage === "hook" ? failure : undefined,
        probeError: stage === "probe" ? failure : undefined,
        loadError: stage === "load" ? failure : undefined,
      });

      const lifecycle = await launchDesktopMain(value.dependencies);

      expect(value.events).toContain("service:shutdown");
      if (stage === "load") expect(value.events).toContain("window:destroy");
      expect(value.events.at(-1)).toBe(`error:${stage} failed:/profile/logs`);
      expect(lifecycle.startupErrorWindow).not.toBeNull();
    },
  );

  it("preserves the startup cause when cleanup also fails", async () => {
    const value = harness({
      origin: "http://localhost:45123",
      shutdownError: new Error("cleanup failed"),
    });

    await launchDesktopMain(value.dependencies);

    expect(value.events.at(-1)).toBe(
      "error:The local service reported an invalid origin.:/profile/logs",
    );
  });

  it("aborts a startup probe that does not settle", async () => {
    vi.useFakeTimers();
    try {
      const value = harness({ probeWaitsForAbort: true });
      const launching = launchDesktopMain(value.dependencies);

      await vi.advanceTimersByTimeAsync(15_000);
      const lifecycle = await launching;

      expect(lifecycle.launched).toBe(false);
      expect(value.events).toContain(
        "error:startup probe timed out:/profile/logs",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("workspace change transaction", () => {
  it("restores the old workspace before changing pointer, origin authorization, or window", async () => {
    const events: string[] = [];
    let activeWorkspace = "/documents/Earth Stories";
    let serviceWorkspace = activeWorkspace;
    let authorizedOrigin = "http://127.0.0.1:45123";
    let windowOrigin = authorizedOrigin;
    const writePointer = vi.fn(async () => events.push("pointer:new"));
    const restartWithWorkspace = vi
      .fn()
      .mockImplementationOnce(async (workspace) => {
        serviceWorkspace = workspace;
        events.push("restart:new:failed");
        throw new Error("new workspace readiness failed");
      })
      .mockImplementationOnce(async (workspace) => {
        serviceWorkspace = workspace;
        events.push("restart:old");
        return "http://127.0.0.1:45124";
      });

    await expect(
      changeDesktopWorkspace({
        currentWorkspace: activeWorkspace,
        nextWorkspace: "/documents/Another Workspace",
        restartWithWorkspace,
        writePointer,
        activate: async ({ workspace, origin }) => {
          activeWorkspace = workspace;
          authorizedOrigin = origin;
          windowOrigin = origin;
          events.push(`activate:${workspace}:${origin}`);
        },
      }),
    ).rejects.toThrow("new workspace readiness failed");

    expect(writePointer).not.toHaveBeenCalled();
    expect(activeWorkspace).toBe("/documents/Earth Stories");
    expect(serviceWorkspace).toBe("/documents/Earth Stories");
    expect(authorizedOrigin).toBe("http://127.0.0.1:45124");
    expect(windowOrigin).toBe("http://127.0.0.1:45124");
    expect(events).toEqual([
      "restart:new:failed",
      "restart:old",
      "activate:/documents/Earth Stories:http://127.0.0.1:45124",
    ]);
  });
});

describe("service origin", () => {
  it("accepts only the canonical ephemeral loopback origin", () => {
    expect(requireServiceOrigin("http://127.0.0.1:45123")).toBe(
      "http://127.0.0.1:45123",
    );
  });
});

describe("desktop session partition", () => {
  it("uses a unique non-persisted partition for every launch", () => {
    const first = createEphemeralSessionPartition();
    const second = createEphemeralSessionPartition();

    expect(first).not.toBe(second);
    expect(first.startsWith("persist:")).toBe(false);
    expect(second.startsWith("persist:")).toBe(false);
  });
});

describe("browser window close adapter", () => {
  it("allows an already-destroyed window without waiting or closing again", async () => {
    const calls: string[] = [];
    const browserWindow = {
      isDestroyed: () => true,
      close: () => calls.push("close"),
      once: () => calls.push("listen:closed"),
      removeListener: () => undefined,
      webContents: {
        once: () => calls.push("listen:will-prevent-unload"),
        removeListener: () => undefined,
      },
    } as unknown as Parameters<typeof requestBrowserWindowClose>[0];

    await expect(requestBrowserWindowClose(browserWindow)).resolves.toBe(true);
    expect(calls).toEqual([]);
  });

  it("settles and removes listeners when the window emits no close event", async () => {
    vi.useFakeTimers();
    try {
      const removeClosed = vi.fn();
      const removePrevented = vi.fn();
      const browserWindow = {
        isDestroyed: () => false,
        close: vi.fn(),
        once: vi.fn(),
        removeListener: removeClosed,
        webContents: {
          once: vi.fn(),
          removeListener: removePrevented,
        },
      } as unknown as Parameters<typeof requestBrowserWindowClose>[0];

      const closing = Promise.race([
        requestBrowserWindowClose(browserWindow),
        new Promise<boolean>((_resolve, reject) =>
          setTimeout(
            () => reject(new Error("window close stayed pending")),
            60_000,
          ),
        ),
      ]);
      const settled = expect(closing).resolves.toBe(true);
      await vi.runAllTimersAsync();

      await settled;
      expect(removeClosed).toHaveBeenCalledWith("closed", expect.any(Function));
      expect(removePrevented).toHaveBeenCalledWith(
        "will-prevent-unload",
        expect.any(Function),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("window dimensions", () => {
  it("ignores every preference except valid dimensions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "earth-stories-desktop-"));
    const path = join(directory, "window.json");
    await writeFile(
      path,
      JSON.stringify({
        width: 1250,
        height: 810,
        url: "http://127.0.0.1:1234/projects/secret",
        projectId: "secret",
        story: { title: "Private draft" },
      }),
    );

    await expect(readWindowDimensions(path)).resolves.toEqual({
      width: 1250,
      height: 810,
    });
  });

  it("writes dimensions and no project or navigation state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "earth-stories-desktop-"));
    const path = join(directory, "preferences", "window.json");

    await writeWindowDimensions(path, { width: 1400, height: 920 });

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      width: 1400,
      height: 920,
    });
    expect(await readdir(join(directory, "preferences"))).toEqual([
      "window.json",
    ]);
  });

  it("debounces rapid writes and serializes the latest dimensions", async () => {
    const writes: string[] = [];
    const persist = createDimensionPersistence({
      path: "/profile/window.json",
      delayMs: 5,
      write: async (_path, dimensions) => {
        writes.push(`${dimensions.width}x${dimensions.height}`);
      },
      reportError: () => undefined,
    });

    persist.schedule({ width: 900, height: 700 });
    persist.schedule({ width: 1000, height: 800 });
    persist.schedule({ width: 1100, height: 900 });
    await persist.flush();

    expect(writes).toEqual(["1100x900"]);
  });

  it("reports preference write failures without rejecting flush", async () => {
    const errors: unknown[] = [];
    const persist = createDimensionPersistence({
      path: "/profile/window.json",
      delayMs: 0,
      write: async () => {
        throw new Error("disk full");
      },
      reportError: (cause) => errors.push(cause),
    });

    persist.schedule({ width: 1100, height: 900 });
    await expect(persist.flush()).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
  });
});

describe("capability request headers", () => {
  it("adds the launch token only for the exact local-service origin", () => {
    expect(
      capabilityRequestHeaders(
        "http://127.0.0.1:45123/api/projects",
        { Accept: "application/json" },
        "http://127.0.0.1:45123",
        "launch-secret",
      ),
    ).toEqual({
      Accept: "application/json",
      Authorization: "Bearer launch-secret",
    });
    expect(
      capabilityRequestHeaders(
        "http://127.0.0.1:45124/api/projects",
        { Accept: "application/json" },
        "http://127.0.0.1:45123",
        "launch-secret",
      ),
    ).toEqual({ Accept: "application/json" });
  });
});

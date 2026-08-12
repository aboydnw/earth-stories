import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DesktopPaths } from "./paths.js";
import {
  capabilityRequestHeaders,
  launchDesktopMain,
  readWindowDimensions,
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
  windowPreferencesFile: "/profile/window.json",
  pixiExecutable: "/profile/tools/bin/pixi",
  pixiHome: "/profile/tools/pixi-home",
};

function harness(
  options: {
    lock?: boolean;
    startError?: Error;
    shutdownError?: Error;
    launchArguments?: string[];
  } = {},
) {
  const events: string[] = [];
  let secondInstance: ((argv: string[]) => void) | undefined;
  let openFile: ((path: string) => void) | undefined;
  let beforeQuit: ((event: QuitEvent) => void) | undefined;
  let startupErrorClosed: (() => void) | undefined;
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
        return "http://127.0.0.1:45123";
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
    installHeaderHook: () => events.push("session:hook"),
    createWindow: ({ dimensions }) => {
      events.push(`window:create:${dimensions.width}x${dimensions.height}`);
      return {
        focus: () => events.push("window:focus"),
        isMinimized: () => true,
        restore: () => events.push("window:restore"),
        onDimensionsChanged: (listener) => {
          dimensionsChanged = listener;
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
      "window:create:1111x777",
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

  it("prevents quit until service work drains and then closes once", async () => {
    const value = harness();
    await launchDesktopMain(value.dependencies);
    const quitEvent = { preventDefault: () => value.events.push("prevent") };

    value.beforeQuit()?.(quitEvent);
    value.beforeQuit()?.(quitEvent);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(value.events.slice(-4)).toEqual([
      "prevent",
      "service:shutdown",
      "prevent",
      "quit",
    ]);
  });

  it("finishes quitting when service cleanup reports an error", async () => {
    const value = harness({ shutdownError: new Error("close failed") });
    await launchDesktopMain(value.dependencies);

    value.beforeQuit()?.({
      preventDefault: () => value.events.push("prevent"),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(value.events.slice(-3)).toEqual([
      "prevent",
      "service:shutdown",
      "quit",
    ]);
  });

  it("persists changed window dimensions through the dimensions-only writer", async () => {
    const value = harness();
    await launchDesktopMain(value.dependencies);

    value.dimensionsChanged()?.({ width: 1280, height: 900 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(value.events.at(-1)).toBe("dimensions:1280x900");
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

import type {
  LocalService,
  LocalServiceConfig,
  StartingLocalService,
} from "@earth-stories/local-service";
import { describe, expect, it, vi } from "vitest";
import type { DesktopPaths } from "./paths.js";
import {
  DesktopService,
  DesktopServiceReadinessError,
  DesktopServiceUnsavedStateError,
} from "./service.js";

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

function localService(origin: string, events: string[] = []): LocalService {
  return {
    origin,
    port: Number(new URL(origin).port),
    projectsDirectory: paths.projectsDirectory,
    resolveProjectDirectory: async (projectId) => {
      events.push(`resolve:${projectId}`);
      return `${paths.projectsDirectory}/${projectId}`;
    },
    forceTerminateConversions: async () => {
      events.push(`force:${origin}`);
    },
    activity: () => ({ runningConversions: 0, runningPublishes: 0 }),
    drain: async () => {
      events.push(`drain:${origin}`);
      return { runningConversions: 0, runningPublishes: 0 };
    },
    close: async () => {
      events.push(`close:${origin}`);
    },
  };
}

describe("DesktopService", () => {
  it("starts on an ephemeral port with one generated launch capability", async () => {
    let received: LocalServiceConfig | undefined;
    const expected = localService("http://127.0.0.1:45123");
    const service = new DesktopService(paths, {
      begin: (config) => {
        received = config;
        return {
          ready: Promise.resolve(expected),
          close: async () => undefined,
        };
      },
      createCapabilityToken: () => "launch-secret",
    });

    await expect(service.start()).resolves.toBe(expected.origin);
    expect(received).toMatchObject({
      host: "127.0.0.1",
      port: 0,
      projectsDirectory: paths.projectsDirectory,
      viewerDirectory: paths.viewerDirectory,
      editorDirectory: paths.editorDirectory,
      capabilityToken: "launch-secret",
      conversion: {
        pixiExecutable: paths.pixiExecutable,
        manifestDirectory: paths.conversionManifestDirectory,
        workerDirectory: paths.conversionWorkerDirectory,
        pixiHome: paths.pixiHome,
      },
    });
    expect(service.capabilityToken).toBe("launch-secret");
  });

  it("closes an incomplete start when readiness exceeds its deadline", async () => {
    const close = vi.fn(async () => undefined);
    const starting: StartingLocalService = {
      ready: new Promise<LocalService>(() => undefined),
      close,
    };
    const service = new DesktopService(paths, {
      begin: () => starting,
      createCapabilityToken: () => "launch-secret",
      readinessTimeoutMs: 5,
    });

    await expect(service.start()).rejects.toBeInstanceOf(
      DesktopServiceReadinessError,
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("preserves the readiness failure when incomplete-start cleanup also fails", async () => {
    const readiness = new Error("readiness failed");
    const service = new DesktopService(paths, {
      begin: () => ({
        ready: Promise.reject(readiness),
        close: async () => {
          throw new Error("cleanup failed");
        },
      }),
      createCapabilityToken: () => "launch-secret",
    });

    await expect(service.start()).rejects.toBe(readiness);
  });

  it("refuses a workspace restart until renderer unsaved state is resolved", async () => {
    const events: string[] = [];
    const running = localService("http://127.0.0.1:45123", events);
    const service = new DesktopService(paths, {
      begin: () => ({ ready: Promise.resolve(running), close: running.close }),
      createCapabilityToken: () => "launch-secret",
    });
    await service.start();

    await expect(
      service.restartWithWorkspace("/documents/Another Workspace", {
        unsavedStateResolved: false,
      }),
    ).rejects.toBeInstanceOf(DesktopServiceUnsavedStateError);
    expect(events).toEqual([]);
    expect(service.origin).toBe("http://127.0.0.1:45123");
  });

  it("drains and closes the old instance before exposing a restarted workspace", async () => {
    const events: string[] = [];
    const configuredProjects: string[] = [];
    const instances = [
      localService("http://127.0.0.1:45123", events),
      localService("http://127.0.0.1:45124", events),
    ];
    const service = new DesktopService(paths, {
      begin: (config) => {
        configuredProjects.push(config.projectsDirectory);
        const next = instances.shift();
        if (!next) throw new Error("unexpected third start");
        events.push(`start:${next.origin}`);
        return { ready: Promise.resolve(next), close: next.close };
      },
      createCapabilityToken: () => "launch-secret",
    });

    await service.start();
    await expect(
      service.restartWithWorkspace("/documents/Another Workspace", {
        unsavedStateResolved: true,
      }),
    ).resolves.toBe("http://127.0.0.1:45124");
    expect(events).toEqual([
      "start:http://127.0.0.1:45123",
      "drain:http://127.0.0.1:45123",
      "close:http://127.0.0.1:45123",
      "start:http://127.0.0.1:45124",
    ]);
    expect(configuredProjects).toEqual([
      "/documents/Earth Stories",
      "/documents/Another Workspace",
    ]);
  });

  it("resolves project identifiers through the active local service", async () => {
    const events: string[] = [];
    const running = localService("http://127.0.0.1:45123", events);
    const service = new DesktopService(paths, {
      begin: () => ({ ready: Promise.resolve(running), close: running.close }),
      createCapabilityToken: () => "launch-secret",
    });
    await service.start();

    await expect(service.resolveProjectDirectory("project-one")).resolves.toBe(
      "/documents/Earth Stories/project-one",
    );
    expect(events).toEqual(["resolve:project-one"]);
  });

  it("refuses new work, drains, and closes during repeated shutdown", async () => {
    const events: string[] = [];
    const running = localService("http://127.0.0.1:45123", events);
    const service = new DesktopService(paths, {
      begin: () => ({ ready: Promise.resolve(running), close: running.close }),
      createCapabilityToken: () => "launch-secret",
    });
    await service.start();

    await Promise.all([service.shutdown(), service.shutdown()]);

    expect(events).toEqual([
      "drain:http://127.0.0.1:45123",
      "close:http://127.0.0.1:45123",
    ]);
  });

  it("still closes the listener when draining reports an error", async () => {
    const events: string[] = [];
    const running = localService("http://127.0.0.1:45123", events);
    running.drain = async () => {
      events.push("drain");
      throw new Error("drain failed");
    };
    running.close = async () => {
      events.push("close");
    };
    const service = new DesktopService(paths, {
      begin: () => ({ ready: Promise.resolve(running), close: running.close }),
      createCapabilityToken: () => "launch-secret",
    });
    await service.start();

    await expect(service.shutdown()).rejects.toThrow("drain failed");

    expect(events).toEqual(["drain", "close"]);
  });

  it("force-terminates residual conversion trees after drain timeout", async () => {
    const events: string[] = [];
    const running = localService("http://127.0.0.1:45123", events);
    running.drain = async () => {
      events.push("drain");
      return { runningConversions: 1, runningPublishes: 2 };
    };
    const service = new DesktopService(paths, {
      begin: () => ({ ready: Promise.resolve(running), close: running.close }),
      createCapabilityToken: () => "launch-secret",
    });
    await service.start();

    await service.shutdown();

    expect(events).toEqual([
      "drain",
      "force:http://127.0.0.1:45123",
      "close:http://127.0.0.1:45123",
    ]);
  });
});

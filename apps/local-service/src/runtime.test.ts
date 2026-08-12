import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CredentialStore, LocalServiceConfig } from "./config.js";
import {
  drainJobRegistries,
  LocalServiceStartupError,
  startLocalService,
  toStartupError,
} from "./runtime.js";

const roots: string[] = [];
const credentials: CredentialStore = {
  read: async () => null,
  write: async () => undefined,
  clear: async () => undefined,
};

async function config(): Promise<LocalServiceConfig> {
  const root = await mkdtemp(join(tmpdir(), "earth-stories-runtime-"));
  roots.push(root);
  const viewerDirectory = join(root, "viewer");
  await mkdir(viewerDirectory);
  return {
    host: "127.0.0.1",
    port: 0,
    projectsDirectory: join(root, "projects"),
    viewerDirectory,
    editorDirectory: null,
    conversion: {
      pixiExecutable: join(root, "pixi"),
      manifestDirectory: root,
      workerDirectory: join(root, "worker"),
      pixiHome: null,
    },
    credentials,
    capabilityToken: null,
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("startLocalService", () => {
  it("imports without starting a server", async () => {
    const before = (process as unknown as { _getActiveHandles(): unknown[] })
      ._getActiveHandles()
      .filter((handle) => handle instanceof Object && "address" in handle);
    await import(
      /* @vite-ignore */ new URL("./runtime.js?import-safe", import.meta.url)
        .href
    );
    const after = (process as unknown as { _getActiveHandles(): unknown[] })
      ._getActiveHandles()
      .filter((handle) => handle instanceof Object && "address" in handle);
    expect(after).toHaveLength(before.length);
  });

  it("starts isolated port-zero services and closes idempotently", async () => {
    const firstConfig = await config();
    const secondConfig = await config();
    const [first, second] = await Promise.all([
      startLocalService(firstConfig),
      startLocalService(secondConfig),
    ]);
    expect(first.port).not.toBe(second.port);
    expect(first.projectsDirectory).toBe(firstConfig.projectsDirectory);
    expect(second.projectsDirectory).toBe(secondConfig.projectsDirectory);
    expect(await (await fetch(`${first.origin}/health`)).json()).toMatchObject({
      projectsDirectory: firstConfig.projectsDirectory,
    });

    await Promise.all([first.close(), first.close(), second.close()]);
  });

  it("closes promptly with an open keep-alive connection", async () => {
    const service = await startLocalService(await config());
    const response = await fetch(`${service.origin}/health`);
    expect(response.ok).toBe(true);
    await expect(
      Promise.race([
        service.close(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("close timed out")), 250),
        ),
      ]),
    ).resolves.toBeUndefined();
  });

  it("drain latches refusal and returns idle counts", async () => {
    const service = await startLocalService(await config());
    expect(service.activity()).toEqual({
      runningConversions: 0,
      runningPublishes: 0,
    });
    await expect(service.drain({ timeoutMs: 20 })).resolves.toEqual({
      runningConversions: 0,
      runningPublishes: 0,
    });
    const refused = await fetch(
      `${service.origin}/api/projects/not-created/conversions`,
      {
        method: "POST",
        headers: { origin: service.origin },
        body: "{}",
      },
    );
    expect(await refused.json()).toEqual({
      error: "The local service is shutting down and cannot start new jobs.",
    });
    await service.close();
  });

  it("drain requests cancellation and times out with uncooperative counts", async () => {
    const calls: string[] = [];
    const conversion = {
      activity: () => 1,
      refuseNewJobs: () => calls.push("refuse-conversion"),
      cancelRunning: () => calls.push("cancel-conversion"),
      whenIdle: () => new Promise<void>(() => undefined),
    };
    const pages = {
      activity: () => 2,
      refuseNewJobs: () => calls.push("refuse-pages"),
      cancelRunning: () => calls.push("cancel-pages"),
      whenIdle: () => new Promise<void>(() => undefined),
    };

    await expect(
      drainJobRegistries(conversion, pages, { timeoutMs: 5 }),
    ).resolves.toEqual({ runningConversions: 1, runningPublishes: 2 });
    expect(calls).toEqual([
      "refuse-conversion",
      "refuse-pages",
      "cancel-conversion",
      "cancel-pages",
    ]);
  });

  it.each([
    ["EADDRINUSE", "address-in-use"],
    ["EACCES", "access-denied"],
  ] as const)("maps %s to a stable startup code", (causeCode, expectedCode) => {
    const error = toStartupError(
      Object.assign(new Error("listen failed"), { code: causeCode }),
      4317,
    );
    expect(error).toBeInstanceOf(LocalServiceStartupError);
    expect(error.code).toBe(expectedCode);
  });

  it("reports an occupied port as a typed startup error", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen(0, "127.0.0.1", resolve);
    });
    const address = blocker.address();
    if (!address || typeof address === "string") throw new Error("not bound");
    const value = await config();
    try {
      await expect(
        startLocalService({ ...value, port: address.port }),
      ).rejects.toMatchObject({
        code: "address-in-use",
      });
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });

  it("reports missing viewer and unwritable projects paths with stable codes", async () => {
    const missingViewer = await config();
    await expect(
      startLocalService({
        ...missingViewer,
        viewerDirectory: join(missingViewer.viewerDirectory, "missing"),
      }),
    ).rejects.toMatchObject({ code: "missing-viewer-directory" });

    const viewerFile = await config();
    await rm(viewerFile.viewerDirectory, { recursive: true });
    await writeFile(viewerFile.viewerDirectory, "not a directory");
    await expect(startLocalService(viewerFile)).rejects.toMatchObject({
      code: "missing-viewer-directory",
    });

    const unwritableProjects = await config();
    await writeFile(unwritableProjects.projectsDirectory, "not a directory");
    await expect(startLocalService(unwritableProjects)).rejects.toMatchObject({
      code: "unwritable-projects-directory",
    });
  });
});

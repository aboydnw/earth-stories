import { access, mkdtemp, mkdir, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectStore } from "@earth-stories/project-store";
import { resolveLocalServiceConfig, type CredentialStore } from "./config.js";

const temporaryDirectories: string[] = [];
const credentials: CredentialStore = {
  read: async () => null,
  write: async () => undefined,
  clear: async () => undefined,
};

async function setup(limits?: { maxBodyBytes?: number }) {
  const root = await mkdtemp(join(tmpdir(), "earth-stories-server-"));
  temporaryDirectories.push(root);
  const viewerDirectory = join(root, "viewer");
  const projectsDirectory = join(root, "projects");
  await mkdir(viewerDirectory);
  const config = await resolveLocalServiceConfig({
    host: "127.0.0.1",
    port: 0,
    projectsDirectory,
    viewerDirectory,
    editorDirectory: null,
    conversion: {
      pixiExecutable: join(root, "pixi"),
      manifestDirectory: join(root, "manifest"),
      workerDirectory: join(root, "worker"),
      pixiHome: null,
    },
    credentials,
    capabilityToken: null,
    limits,
  });
  const store = new ProjectStore(projectsDirectory);
  await store.initialize();
  return { config, store };
}

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("not bound");
  return address.port;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("createLocalServer", () => {
  it("imports without opening a port or creating a directory", async () => {
    const projectsDirectory = join(
      tmpdir(),
      `earth-stories-import-${crypto.randomUUID()}`,
    );
    const previous = process.env.EARTH_STORIES_PROJECTS_DIR;
    process.env.EARTH_STORIES_PROJECTS_DIR = projectsDirectory;
    const before = (process as unknown as { _getActiveHandles(): unknown[] })
      ._getActiveHandles()
      .filter((handle) => handle instanceof Object && "address" in handle);
    try {
      await import(
        /* @vite-ignore */ new URL("./server.js?import-safe", import.meta.url)
          .href
      );
      await import(
        /* @vite-ignore */ new URL("./config.js?import-safe", import.meta.url)
          .href
      );
      await import(
        /* @vite-ignore */ new URL(
          "./conversion-runtime.js?import-safe",
          import.meta.url,
        ).href
      );
    } finally {
      if (previous === undefined) delete process.env.EARTH_STORIES_PROJECTS_DIR;
      else process.env.EARTH_STORIES_PROJECTS_DIR = previous;
    }
    const after = (process as unknown as { _getActiveHandles(): unknown[] })
      ._getActiveHandles()
      .filter((handle) => handle instanceof Object && "address" in handle);
    expect(after).toHaveLength(before.length);
    await expect(access(projectsDirectory)).rejects.toThrow();
  });

  it("uses the actual bound port when parsing request URLs", async () => {
    const { config, store } = await setup();
    const { createLocalServer } = await import("./server.js");
    const server = createLocalServer(store, config);
    const port = await listen(server);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: "ready",
        projectsDirectory: store.root,
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("preserves the body-limit boundary with injected limits", async () => {
    const { config, store } = await setup({ maxBodyBytes: 12 });
    const { createLocalServer } = await import("./server.js");
    const server = createLocalServer(store, config);
    const port = await listen(server);
    try {
      const accepted = await fetch(`http://127.0.0.1:${port}/api/discover`, {
        method: "POST",
        headers: { origin: `http://127.0.0.1:${port}` },
        body: "123456789012",
      });
      expect(await accepted.json()).toEqual({
        error: expect.not.stringContaining("too large"),
      });
      const rejected = await fetch(`http://127.0.0.1:${port}/api/discover`, {
        method: "POST",
        headers: { origin: `http://127.0.0.1:${port}` },
        body: "1234567890123",
      });
      expect(await rejected.json()).toEqual({
        error: "Request body is too large",
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

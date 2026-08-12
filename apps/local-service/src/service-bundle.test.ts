import { execFile } from "node:child_process";
import { cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import type { LocalServiceConfig } from "./config.js";
import type { LocalService } from "./runtime.js";

const exec = promisify(execFile);
const packageDirectory = resolve("apps/local-service");
const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("production service bundle", () => {
  it("relocates, imports safely, and runs a repository-independent API cycle", async () => {
    await exec("yarn", ["workspace", "@earth-stories/local-service", "build"], {
      cwd: resolve("."),
    });
    const root = await mkdtemp(join(tmpdir(), "earth-stories-bundle-"));
    temporaryDirectories.push(root);
    const relocated = join(root, "service.js");
    await cp(join(packageDirectory, "dist/service.js"), relocated);
    await cp(join(packageDirectory, "dist/service.js.map"), `${relocated}.map`);
    const viewerDirectory = join(root, "viewer");
    await mkdir(viewerDirectory);
    const projectsDirectory = join(root, "projects");
    const before = (process as unknown as { _getActiveHandles(): unknown[] })
      ._getActiveHandles()
      .filter((handle) => handle instanceof Object && "address" in handle);

    const bundled = (await import(
      `${new URL(`file://${relocated}`).href}?fresh`
    )) as {
      startLocalService(config: LocalServiceConfig): Promise<LocalService>;
      FileCredentialStore: new (path: string) => unknown;
    };
    const afterImport = (
      process as unknown as { _getActiveHandles(): unknown[] }
    )
      ._getActiveHandles()
      .filter((handle) => handle instanceof Object && "address" in handle);
    expect(afterImport).toHaveLength(before.length);
    expect(bundled.FileCredentialStore).toBeTypeOf("function");

    const service = await bundled.startLocalService({
      host: "127.0.0.1",
      port: 0,
      projectsDirectory,
      viewerDirectory,
      editorDirectory: null,
      conversion: {
        pixiExecutable: join(root, "pixi"),
        manifestDirectory: root,
        workerDirectory: root,
        pixiHome: null,
      },
      credentials: {
        read: async () => null,
        write: async () => undefined,
        clear: async () => undefined,
      },
      capabilityToken: null,
    });
    try {
      expect(await (await fetch(`${service.origin}/health`)).json()).toEqual({
        status: "ready",
        projectsDirectory,
      });
      const created = await fetch(`${service.origin}/api/projects`, {
        method: "POST",
        headers: {
          origin: service.origin,
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Relocated bundle" }),
      });
      expect(created.status).toBe(201);
      const project = (await created.json()) as { id: string };
      expect(
        await (
          await fetch(`${service.origin}/api/projects/${project.id}`)
        ).json(),
      ).toMatchObject({ metadata: { title: "Relocated bundle" } });
    } finally {
      await service.close();
    }
  });
});

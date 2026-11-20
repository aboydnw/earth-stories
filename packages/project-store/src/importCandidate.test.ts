import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ProjectStore } from "./store.js";
it("imports the same candidate once under concurrent acceptance and rejects a different receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "earth-import-"));
  try {
    const store = new ProjectStore(root);
    const project = await store.create({ title: "Template" });
    await store.archive(project.id);
    const input = {
      destinationId: "accepted",
      jobId: "job1",
      digest: "a".repeat(64),
      project: { ...project, id: "accepted" },
      assets: [],
      brief: { title: "Private context" },
    };
    const [a, b] = await Promise.all([
      store.importCandidate(input),
      store.importCandidate(input),
    ]);
    expect(a.id).toBe(b.id);
    expect(await store.list()).toHaveLength(1);
    await expect(
      store.importCandidate({ ...input, digest: "b".repeat(64) }),
    ).rejects.toThrow(/conflict/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("leaves no visible project when an asset fails integrity validation", async () => {
  const root = await mkdtemp(join(tmpdir(), "earth-import-failure-"));
  try {
    const store = new ProjectStore(root);
    const project = await store.create({ title: "Template" });
    await store.archive(project.id);
    await expect(
      store.importCandidate({
        destinationId: "failed",
        jobId: "job1",
        digest: "a".repeat(64),
        project: { ...project, id: "failed" },
        assets: [
          {
            path: `assets/${"a".repeat(64)}.png`,
            digest: "a".repeat(64),
            contents: new Uint8Array([1]),
          },
        ],
        brief: {},
      }),
    ).rejects.toThrow("Invalid candidate asset");
    expect(await store.list()).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("recovers an import lock left by a dead process without creating a duplicate", async () => {
  const { writeFile } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "earth-import-lock-"));
  try {
    const store = new ProjectStore(root);
    const project = await store.create({ title: "Template" });
    await store.archive(project.id);
    await writeFile(
      join(root, ".candidate-recovered.lock"),
      JSON.stringify({ pid: 2147483647, created: new Date().toISOString() }),
    );
    const imported = await store.importCandidate({
      destinationId: "recovered",
      jobId: "job",
      digest: "a".repeat(64),
      project: { ...project, id: "recovered" },
      assets: [],
      brief: {},
    });
    expect(imported.id).toBe("recovered");
    expect(await store.list()).toHaveLength(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

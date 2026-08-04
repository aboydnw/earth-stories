import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { ProjectStore } from "./store.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createStore(): Promise<ProjectStore> {
  const root = await mkdtemp(join(tmpdir(), "earth-stories-test-"));
  roots.push(root);
  return new ProjectStore(root);
}

describe("ProjectStore", () => {
  it("creates, lists, reads, and atomically saves a project", async () => {
    const store = await createStore();
    const created = await store.create({ title: "River Atlas" });
    expect(created.id).toBe("river-atlas");
    expect(await store.list()).toEqual([
      expect.objectContaining({ id: "river-atlas", chapterCount: 1 }),
    ]);

    const saved = await store.save(created.id, {
      ...created,
      metadata: { ...created.metadata, title: "River Atlas: Field Notes" },
    });
    expect(saved.metadata.title).toBe("River Atlas: Field Notes");
    expect((await store.read(created.id)).metadata.title).toBe(
      "River Atlas: Field Notes",
    );

    const backups = await readdir(
      join(store.root, created.id, ".earth-stories", "backups"),
    );
    expect(backups).toHaveLength(1);
    expect(
      JSON.parse(
        await readFile(join(store.root, created.id, "story.json"), "utf8"),
      ),
    ).toEqual(saved);
  });

  it("allocates unique project IDs", async () => {
    const store = await createStore();
    expect((await store.create({ title: "River Atlas" })).id).toBe(
      "river-atlas",
    );
    expect((await store.create({ title: "River Atlas" })).id).toBe(
      "river-atlas-2",
    );
  });

  it("rejects traversal-shaped project and asset paths", async () => {
    const store = await createStore();
    await expect(store.read("../private")).rejects.toThrow(
      "Invalid project ID",
    );
    await store.create({ title: "Safe Project" });
    expect(() => store.assetPath("safe-project", "../../private.txt")).toThrow(
      "escapes the project directory",
    );
  });
});

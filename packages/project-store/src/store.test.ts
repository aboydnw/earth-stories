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

  it("archives a project outside the active workspace", async () => {
    const store = await createStore();
    const project = await store.create({ title: "Finished draft" });
    await store.archive(project.id);
    expect(await store.list()).toEqual([]);
    await expect(store.read(project.id)).rejects.toThrow();
    expect(await readdir(join(store.root, ".trash"))).toHaveLength(1);
  });

  it("creates one editable local copy for each example template", async () => {
    const store = await createStore();
    const template = await store.create({ title: "Example River" });
    const copy = await store.createFromTemplate({
      ...template,
      id: "master-example",
      metadata: {
        ...template.metadata,
        title: "Example River copy",
        description: "A curated starting point",
      },
    });
    const reopened = await store.createFromTemplate({
      ...template,
      id: "master-example",
      metadata: {
        ...template.metadata,
        title: "A changed catalog title",
      },
    });
    expect(copy.id).toBe("master-example");
    expect(copy.metadata.description).toBe("A curated starting point");
    expect(reopened).toEqual(copy);
    expect(
      (await store.list()).filter(({ id }) => id === copy.id),
    ).toHaveLength(1);
    expect(await store.read(template.id)).toEqual(template);
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

  it("imports assets with safe unique filenames", async () => {
    const store = await createStore();
    const project = await store.create({ title: "Asset Story" });
    const first = await store.importAsset(
      project.id,
      "field notes.csv",
      new TextEncoder().encode("label,value\na,2\n"),
    );
    const second = await store.importAsset(
      project.id,
      "field notes.csv",
      new TextEncoder().encode("label,value\nb,3\n"),
    );
    expect(first.path).toBe("assets/field-notes.csv");
    expect(second.path).toBe("assets/field-notes-2.csv");
    expect(
      await readFile(store.assetPath(project.id, first.path), "utf8"),
    ).toContain("a,2");
  });
});

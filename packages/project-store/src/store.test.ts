import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  utimes,
  writeFile,
} from "node:fs/promises";
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
    expect((await store.create({ title: "Example Antakya" })).id).toBe(
      "story-example-antakya",
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
      id: "example-master",
      metadata: {
        ...template.metadata,
        title: "Example River copy",
        description: "A curated starting point",
      },
    });
    const reopened = await store.createFromTemplate({
      ...template,
      id: "example-master",
      metadata: {
        ...template.metadata,
        title: "A changed catalog title",
      },
    });
    expect(copy.id).toBe("example-master");
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

  it("streams large imports and removes partial files after a limit failure", async () => {
    const store = await createStore();
    const project = await store.create({ title: "Streaming assets" });
    async function* chunks() {
      yield new Uint8Array([1, 2, 3]);
      yield new Uint8Array([4, 5, 6]);
    }

    await expect(
      store.importAssetStream(project.id, "too-large.laz", chunks(), 5),
    ).rejects.toThrow("local import limit");
    expect(await readdir(join(store.root, project.id, "assets"))).toEqual([]);

    const imported = await store.importAssetStream(
      project.id,
      "points.laz",
      chunks(),
      10,
    );
    expect(imported).toMatchObject({
      path: "assets/points.laz",
      sizeBytes: 6,
    });
  });

  it("surfaces invalid project files in the workspace", async () => {
    const store = await createStore();
    const directory = join(store.root, "older-project");
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "story.json"),
      JSON.stringify({ schema: "earth-stories/project/v99" }),
    );

    expect(await store.list()).toContainEqual(
      expect.objectContaining({
        id: "older-project",
        invalidReason: expect.stringContaining("Unsupported"),
      }),
    );
  });

  it("rejects stale editor state instead of overwriting a newer save", async () => {
    const store = await createStore();
    const opened = await store.create({ title: "Concurrent edits" });
    await store.save(opened.id, {
      ...opened,
      metadata: { ...opened.metadata, title: "First save" },
    });

    await expect(
      store.save(opened.id, {
        ...opened,
        metadata: { ...opened.metadata, title: "Stale save" },
      }),
    ).rejects.toThrow("changed on disk");
  });

  it("recovers an abandoned write lock", async () => {
    const store = await createStore();
    const project = await store.create({ title: "Recovered story" });
    const lockPath = join(store.root, project.id, ".earth-stories-write.lock");
    await writeFile(lockPath, "abandoned\n");
    const old = new Date(Date.now() - 5 * 60 * 1000);
    await utimes(lockPath, old, old);

    await expect(
      store.save(project.id, {
        ...project,
        metadata: { ...project.metadata, title: "Recovered" },
      }),
    ).resolves.toMatchObject({ metadata: { title: "Recovered" } });
  });
});

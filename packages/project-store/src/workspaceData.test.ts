import {
  mkdtemp,
  readFile,
  rm,
  symlink,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { WorkspaceDataStore, resolveProjectAsset } from "./workspaceData.js";
import { ProjectStore } from "./store.js";
let root: string;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});
it("imports without a story and reuses one file from two stories after restart", async () => {
  root = await mkdtemp(join(tmpdir(), "workspace-data-"));
  const library = new WorkspaceDataStore(root);
  const source = await library.importFile(
    "places.geojson",
    (async function* () {
      yield Buffer.from('{"type":"FeatureCollection","features":[]}');
    })(),
    1024,
  );
  expect(await new WorkspaceDataStore(root).list()).toEqual({
    sources: [source],
    invalidEntries: [],
  });
  const store = new ProjectStore(root);
  const one = await store.create({ title: "One" });
  const two = await store.create({ title: "Two" });
  await store.addSource(one.id, source);
  await store.addSource(two.id, source);
  const locator = "path" in source ? source.path : "";
  const a = await resolveProjectAsset(store.projectPath(one.id), locator);
  const b = await resolveProjectAsset(store.projectPath(two.id), locator);
  expect(a).toBe(b);
  expect(await readFile(a, "utf8")).toContain("FeatureCollection");
  expect((await store.read(one.id)).sources).toEqual([source]);
  await store.archive(one.id);
  expect(await library.list()).toEqual({
    sources: [source],
    invalidEntries: [],
  });
});
it("rejects oversized uploads and does not list partial entries", async () => {
  root = await mkdtemp(join(tmpdir(), "workspace-data-"));
  const library = new WorkspaceDataStore(root);
  await expect(
    library.importFile(
      "test.geojson",
      (async function* () {
        yield Buffer.alloc(10);
      })(),
      2,
    ),
  ).rejects.toThrow(/limit/);
  expect(await library.list()).toEqual({ sources: [], invalidEntries: [] });
});
it("rejects traversal and library symlinks outside the workspace", async () => {
  root = await mkdtemp(join(tmpdir(), "workspace-data-"));
  const project = join(root, "story");
  await mkdir(project);
  await expect(
    resolveProjectAsset(project, "workspace-data/../secret"),
  ).rejects.toThrow();
  await symlink(tmpdir(), join(root, ".data-library"));
  await expect(
    resolveProjectAsset(
      project,
      "workspace-data/12345678-1234-1234-1234-123456789012/data.geojson",
    ),
  ).rejects.toThrow();
});

it("keeps valid sources visible beside a corrupt dataset record", async () => {
  root = await mkdtemp(join(tmpdir(), "workspace-data-"));
  const library = new WorkspaceDataStore(root);
  const source = await library.importFile(
    "good.json",
    (async function* () {
      yield Buffer.from("{}");
    })(),
    1024,
  );
  const broken = "12345678-1234-1234-1234-123456789012";
  await mkdir(join(root, ".data-library", broken));
  await writeFile(join(root, ".data-library", broken, "source.json"), "{");
  expect(await library.list()).toEqual({
    sources: [source],
    invalidEntries: [
      { id: broken, reason: expect.stringContaining("invalid") },
    ],
  });
});

it("validates connections before storing them and preserves valid connections after restart", async () => {
  root = await mkdtemp(join(tmpdir(), "workspace-data-"));
  const library = new WorkspaceDataStore(root);
  const base = {
    id: "test",
    label: "Remote",
    kind: "cog",
    locator: "https://example.com/map.tif",
    delivery: "connected",
  };
  for (const changes of [
    { locator: "https://user:password@example.com/map.tif" },
    { locator: "ftp://example.com/map.tif" },
    { delivery: "included" },
    { kind: "local-geojson", path: "assets/map.geojson" },
  ]) {
    await expect(library.connect({ ...base, ...changes })).rejects.toThrow(
      "Use a public HTTP(S) connection without credentials.",
    );
  }
  expect((await library.list()).sources).toEqual([]);
  const source = await library.connect(base);
  expect((await new WorkspaceDataStore(root).list()).sources).toEqual([source]);
});

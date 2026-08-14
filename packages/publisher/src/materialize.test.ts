import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  storyProjectSchema,
  type StoryProject,
} from "@earth-stories/story-schema";
import { materializePublication } from "./materialize.js";

const temporary: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "earth-stories-materialize-"));
  temporary.push(root);
  const projectDirectory = join(root, "project");
  const outputDirectory = join(root, "candidate");
  const cacheDirectory = join(root, "cache");
  await mkdir(join(projectDirectory, "data"), { recursive: true });
  await mkdir(outputDirectory, { recursive: true });
  return { root, projectDirectory, outputDirectory, cacheDirectory };
}

function projectWith(source: unknown): StoryProject {
  return storyProjectSchema.parse({
    schema: "earth-stories/project/v2",
    id: "materialize-test",
    metadata: {
      title: "Materialize test",
      description: "",
      author: "",
      created: "2026-08-13T00:00:00.000Z",
      updated: "2026-08-13T00:00:00.000Z",
    },
    basemap: {
      id: "default",
      label: "Default",
      styleUrl: "https://tiles.example/style.json",
      attribution: null,
    },
    sources: [source],
    chapters: [
      {
        id: "intro",
        type: "prose",
        title: "Introduction",
        narrative: "Materialization test.",
      },
    ],
    publication: {
      profile: "offline",
      theme: "cng",
      offlineBasemap: { mode: "neutral" },
    },
  });
}

const remoteCog = {
  id: "rain",
  kind: "cog" as const,
  label: "Rain",
  locator: "https://data.example/rain.tif",
  attribution: null,
  sizeBytes: null,
  delivery: "auto" as const,
  cog: { epsg: 4326, definition: "+proj=longlat +datum=WGS84 +no_defs" },
};

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

describe("publication materialization", () => {
  it("requires an explicit viewer directory for bundled runtime dependencies", async () => {
    const paths = await workspace();
    const project = projectWith({
      id: "parquet",
      kind: "geoparquet",
      label: "Parquet",
      locator: "data/table.parquet",
      attribution: null,
      sizeBytes: null,
      delivery: "included",
    });

    await expect(materializePublication({ ...paths, project })).rejects.toThrow(
      /viewer directory.*runtime dependencies/i,
    );
  });

  it("rejects a truncated remote response and removes partial files", async () => {
    const paths = await workspace();
    const fetchRemote = vi.fn(
      async () =>
        new Response("short", {
          status: 200,
          headers: { "content-length": "10" },
        }),
    );

    await expect(
      materializePublication({
        ...paths,
        project: projectWith(remoteCog),
        fetchRemote,
      }),
    ).rejects.toThrow(/ended after 5 bytes/i);

    await expect(readdir(paths.outputDirectory)).resolves.toEqual([]);
    await expect(readdir(paths.cacheDirectory)).resolves.not.toContainEqual(
      expect.stringContaining("partial"),
    );
  });

  it("rejects a checksum mismatch without promoting bytes to the cache", async () => {
    const paths = await workspace();
    const fetchRemote = vi.fn(
      async () => new Response("changed", { status: 200 }),
    );

    await expect(
      materializePublication({
        ...paths,
        project: projectWith(remoteCog),
        dependencyDigests: {
          "source:rain:data": sha256("expected"),
        },
        fetchRemote,
      }),
    ).rejects.toThrow(/checksum/i);

    const cacheFiles = await readdir(paths.cacheDirectory, { recursive: true });
    expect(cacheFiles).not.toContain(join("sha256", sha256("changed")));
  });

  it("reuses a verified persistent cache without contacting the remote locator", async () => {
    const paths = await workspace();
    const bytes = "stable-cog";
    const expected = sha256(bytes);
    const fetchRemote = vi.fn(async () => new Response(bytes, { status: 200 }));
    const first = await materializePublication({
      ...paths,
      project: projectWith(remoteCog),
      fetchRemote,
    });
    expect(first.dependencyDigests["source:rain:data"]).toBe(expected);
    expect(first.downloadedBytes).toBe(Buffer.byteLength(bytes));

    await rm(paths.outputDirectory, { recursive: true, force: true });
    await mkdir(paths.outputDirectory);
    fetchRemote.mockRejectedValue(new Error("network must not be used"));
    const second = await materializePublication({
      ...paths,
      project: projectWith(remoteCog),
      fetchRemote,
    });

    expect(fetchRemote).toHaveBeenCalledTimes(1);
    expect(second.reusedCacheEntries).toBeGreaterThan(0);
    expect(
      await readFile(join(paths.outputDirectory, "assets", "rain.tif"), "utf8"),
    ).toBe(bytes);
  });

  it("fails closed when a known cache entry is corrupt instead of downloading", async () => {
    const paths = await workspace();
    const expected = sha256("expected");
    const cachePath = join(paths.cacheDirectory, "sha256", expected);
    await mkdir(join(paths.cacheDirectory, "sha256"), { recursive: true });
    await writeFile(cachePath, "corrupt");
    const fetchRemote = vi.fn(async () => new Response("expected"));

    await expect(
      materializePublication({
        ...paths,
        project: projectWith(remoteCog),
        dependencyDigests: { "source:rain:data": expected },
        fetchRemote,
      }),
    ).rejects.toThrow(/cached.*checksum/i);
    expect(fetchRemote).not.toHaveBeenCalled();
  });

  it("deduplicates identical local bytes in content-addressed storage", async () => {
    const paths = await workspace();
    await writeFile(
      join(paths.projectDirectory, "data", "shared.geojson"),
      "same",
    );
    const project = projectWith({
      id: "one",
      kind: "local-geojson",
      label: "One",
      path: "data/shared.geojson",
      attribution: null,
      sizeBytes: null,
      delivery: "included",
    });
    project.sources.push({ ...project.sources[0]!, id: "two", label: "Two" });

    const result = await materializePublication({ ...paths, project });
    expect(result.materializedFiles).toHaveLength(3);
    expect(
      await readFile(
        join(paths.outputDirectory, "assets", "one.geojson"),
        "utf8",
      ),
    ).toBe("same");
    expect(
      await readFile(
        join(paths.outputDirectory, "assets", "two.geojson"),
        "utf8",
      ),
    ).toBe("same");
    const cached = await readdir(join(paths.cacheDirectory, "sha256"));
    expect(cached.filter((name) => name === sha256("same"))).toHaveLength(1);
  });

  it("rejects source symlinks that resolve outside the project workspace", async () => {
    const paths = await workspace();
    const outside = join(paths.root, "outside.geojson");
    await writeFile(outside, "outside");
    await (
      await import("node:fs/promises")
    ).symlink(outside, join(paths.projectDirectory, "data", "outside.geojson"));
    const project = projectWith({
      id: "escape",
      kind: "local-geojson",
      label: "Escape",
      path: "data/outside.geojson",
      attribution: null,
      sizeBytes: null,
      delivery: "included",
    });

    await expect(materializePublication({ ...paths, project })).rejects.toThrow(
      /outside the project/i,
    );
    await expect(
      stat(join(paths.outputDirectory, "assets", "escape.geojson")),
    ).rejects.toThrow();
  });
});

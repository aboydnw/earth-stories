import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPublication } from "./build.js";
import {
  verifyPublication,
  type PublicationBrowserVerifier,
} from "./verify.js";

const temporary: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function setupOfflinePublication() {
  const root = await mkdtemp(join(tmpdir(), "earth-stories-verify-test-"));
  temporary.push(root);
  const project = join(root, "project");
  const viewer = join(root, "viewer");
  const output = join(root, "output");
  await cp(join(process.cwd(), "fixtures/field-notes"), project, {
    recursive: true,
  });
  await mkdir(join(viewer, "assets"), { recursive: true });
  await writeFile(
    join(viewer, "index.html"),
    '<!doctype html><script type="module" src="./assets/viewer.js"></script><main></main>',
  );
  await writeFile(join(viewer, "assets", "viewer.js"), "// viewer");
  const story = JSON.parse(await readFile(join(project, "story.json"), "utf8"));
  story.schema = "earth-stories/project/v2";
  story.publication = {
    profile: "offline",
    theme: "cng",
    offlineBasemap: { mode: "neutral" },
  };
  story.sources.push({
    id: "local-ranges",
    kind: "pmtiles",
    tileType: "vector",
    label: "Local ranges",
    locator: "data/local-ranges.pmtiles",
    attribution: null,
    sizeBytes: 4,
    delivery: "included",
  });
  await writeFile(join(project, "data", "local-ranges.pmtiles"), "range");
  await writeFile(join(project, "story.json"), JSON.stringify(story));
  const manifest = await buildPublication({
    projectDirectory: project,
    outputDirectory: output,
    viewerDirectory: viewer,
  });
  return { root, project, viewer, output, manifest };
}

function readyBrowserVerifier(): PublicationBrowserVerifier {
  return vi.fn(async ({ expectedChapterIds }) => ({
    attemptedOutsideOrigin: [],
    runtimeErrors: [],
    webgl: true,
    chapterReadiness: expectedChapterIds.map((chapterId: string) => ({
      chapterId,
      ready: true,
    })),
  }));
}

describe("offline publication verification", () => {
  it("rejects tampered included dependency bytes", async () => {
    const { output, manifest } = await setupOfflinePublication();
    await writeFile(join(output, "assets", "survey-sites.geojson"), "tampered");

    await expect(
      verifyPublication(output, manifest, {
        requireEmbed: true,
        browserVerifier: readyBrowserVerifier(),
      }),
    ).rejects.toThrow("SHA-256");
  });

  it("proves byte-range dependencies through the exact loopback origin", async () => {
    const { output, manifest } = await setupOfflinePublication();
    const rangeDependency = manifest.dependencies.find(
      (dependency) =>
        dependency.delivery === "included" &&
        dependency.requirements.includes("byte-ranges"),
    );
    expect(rangeDependency).toBeDefined();
    const browserVerifier: PublicationBrowserVerifier = vi.fn(
      async ({ origin, expectedChapterIds }) => {
        const response = await fetch(
          new URL(rangeDependency!.locator, `${origin}/`),
          { headers: { range: "bytes=0-0" } },
        );
        expect(response.status).toBe(206);
        expect(response.headers.get("content-range")).toMatch(
          /^bytes 0-0\/\d+$/,
        );
        expect((await response.arrayBuffer()).byteLength).toBe(1);
        return {
          attemptedOutsideOrigin: [],
          runtimeErrors: [],
          webgl: true,
          chapterReadiness: expectedChapterIds.map((chapterId: string) => ({
            chapterId,
            ready: true,
          })),
        };
      },
    );

    const report = await verifyPublication(output, manifest, {
      requireEmbed: true,
      browserVerifier,
    });

    expect(report.rangeChecks).toContainEqual(
      expect.objectContaining({
        dependencyId: rangeDependency!.id,
        status: 206,
        contentRange: expect.stringMatching(/^bytes 0-0\/\d+$/),
      }),
    );
    expect(browserVerifier).toHaveBeenCalledTimes(2);
    expect(report.artifacts.map(({ entrypoint }) => entrypoint)).toEqual([
      "index.html",
      "embed.html",
      "archival.html",
    ]);
  });

  it("rejects undeclared and escaping neutral-style resources", async () => {
    const { output, manifest } = await setupOfflinePublication();
    await writeFile(
      join(output, "basemap", "neutral-style.json"),
      JSON.stringify({
        version: 8,
        glyphs: "../undeclared/{fontstack}/{range}.pbf",
        sources: {},
        layers: [],
      }),
    );
    const diskManifest = JSON.parse(
      await readFile(join(output, "publication.json"), "utf8"),
    );
    const style = diskManifest.dependencies.find(
      ({ id }: { id: string }) => id === "basemap:neutral:style",
    );
    if (!style || style.delivery !== "included")
      throw new Error("Neutral style dependency missing");
    style.sha256 = createHash("sha256")
      .update(await readFile(join(output, "basemap", "neutral-style.json")))
      .digest("hex");
    await writeFile(
      join(output, "publication.json"),
      JSON.stringify(diskManifest),
    );

    await expect(
      verifyPublication(output, manifest, {
        requireEmbed: true,
        browserVerifier: readyBrowserVerifier(),
      }),
    ).rejects.toThrow(/neutral style/i);
  });
});

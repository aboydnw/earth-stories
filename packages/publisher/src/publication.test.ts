import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));
import { buildArchivalHtml } from "./archive.js";
import { buildLatestPublication, buildPublication } from "./build.js";
import { compileProject } from "./compile.js";
import { createEmbedSnippet } from "./embed.js";
import { preflightPublication } from "./preflight.js";

const temporary: string[] = [];
afterEach(async () =>
  Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  ),
);
afterEach(() => vi.restoreAllMocks());

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "earth-stories-publication-test-"));
  temporary.push(root);
  const project = join(root, "project");
  const viewer = join(root, "viewer");
  await cp(join(process.cwd(), "fixtures/field-notes"), project, {
    recursive: true,
  });
  await mkdir(join(viewer, "assets"), { recursive: true });
  await writeFile(
    join(viewer, "index.html"),
    '<!doctype html><script type="module" src="./assets/viewer.js"></script><div id="root"></div>',
  );
  await writeFile(join(viewer, "assets", "viewer.js"), "// viewer");
  return { root, project, viewer };
}

async function readProject(project: string) {
  return JSON.parse(await readFile(join(project, "story.json"), "utf8"));
}

async function directorySize(directory: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) total += await directorySize(path);
    else if (entry.isFile()) total += (await stat(path)).size;
  }
  return total;
}

describe("publication hardening", () => {
  it("preflights and atomically builds every latest-export artifact", async () => {
    const { project, viewer } = await setup();
    const preflight = await preflightPublication(project);
    expect(preflight.ready).toBe(true);
    expect(preflight.estimatedIncludedBytes).toBeGreaterThan(0);
    const snapshot = "data:image/png;base64,aGVsbG8=";
    const first = await buildLatestPublication({
      projectDirectory: project,
      viewerDirectory: viewer,
      mapSnapshots: { sites: snapshot },
    });
    expect(first.directory).toBe(join(project, "publication"));
    expect(
      await readFile(join(first.directory, "embed.html"), "utf8"),
    ).toContain("./assets/viewer.js");
    expect(
      await readFile(join(first.directory, "EMBED.txt"), "utf8"),
    ).toContain("{{PUBLICATION_URL}}/embed.html");
    const archival = await readFile(
      join(first.directory, "archival.html"),
      "utf8",
    );
    expect(archival).toContain('name="dc.title"');
    expect(archival).toContain(snapshot);
    const summary = JSON.parse(
      await readFile(join(first.directory, "publication-summary.json"), "utf8"),
    ) as { totalBytes: number };
    expect(summary.totalBytes).toBe(await directorySize(first.directory));
    await writeFile(join(first.directory, "obsolete.txt"), "old");
    await buildLatestPublication({
      projectDirectory: project,
      viewerDirectory: viewer,
    });
    await expect(
      readFile(join(first.directory, "obsolete.txt"), "utf8"),
    ).rejects.toThrow();
  });

  it("blocks a publication with a missing included asset", async () => {
    const { project } = await setup();
    await rm(join(project, "data", "survey-sites.geojson"));
    const result = await preflightPublication(project);
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        id: "missing-survey-sites",
        severity: "error",
      }),
    );
  });

  it("rejects an included symlink that resolves outside the project", async () => {
    const { root, project } = await setup();
    const outside = join(root, "outside.geojson");
    await writeFile(outside, '{"type":"FeatureCollection","features":[]}');
    await symlink(outside, join(project, "data", "linked.geojson"));
    const story = await readProject(project);
    story.sources[0].path = "data/linked.geojson";
    await writeFile(join(project, "story.json"), JSON.stringify(story));
    const result = await preflightPublication(project);
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        id: "escape-survey-sites",
        severity: "error",
      }),
    );
  });

  it("escapes report values and omits embed artifacts without a viewer", async () => {
    const { root, project } = await setup();
    const output = join(root, "output");
    const story = await readProject(project);
    story.metadata.title = '</strong><img src=x onerror="alert(1)">';
    await writeFile(join(project, "story.json"), JSON.stringify(story));
    await buildPublication({
      projectDirectory: project,
      outputDirectory: output,
    });
    const report = await readFile(
      join(output, "publication-report.html"),
      "utf8",
    );
    expect(report).toContain("&lt;/strong&gt;&lt;img");
    expect(report).not.toContain('<img src=x onerror="alert(1)">');
    await expect(readFile(join(output, "embed.html"))).rejects.toThrow();
    await expect(readFile(join(output, "EMBED.txt"))).rejects.toThrow();
    expect(await readFile(join(output, "README.txt"), "utf8")).not.toContain(
      "embed.html",
    );
  });

  it("preserves quoted commas, quotes, and multiline CSV cells in archives", async () => {
    const { project } = await setup();
    const story = await readProject(project);
    story.sources.push({
      id: "observations",
      kind: "csv",
      label: "Observations",
      path: "data/observations.csv",
      attribution: null,
      sizeBytes: null,
      delivery: "included",
    });
    story.chapters.push({
      id: "chart",
      type: "chart",
      title: "Observations",
      narrative: "",
      sourceId: "observations",
      chartType: "bar",
      xColumn: "label",
      yColumn: "value",
    });
    await writeFile(
      join(project, "data", "observations.csv"),
      'label,value\n"North, bank",12\n"Multi\nline",8\n"Quote ""A""",4\n',
    );
    const manifest = compileProject(story);
    const archive = await buildArchivalHtml({
      project: story,
      manifest,
      projectDirectory: project,
    });
    expect(archive).toContain("North, bank: 12");
    expect(archive).toContain("Multi\nline: 8");
    expect(archive).toContain("Quote &quot;A&quot;: 4");
  });

  it("rejects unsafe archive links and malformed map snapshot data", async () => {
    const { project } = await setup();
    const story = await readProject(project);
    const manifest = compileProject(story);
    manifest.assets.push({
      id: "unsafe",
      label: "Unsafe",
      kind: "xyz",
      delivery: "connected",
      href: "javascript:alert(1)",
      attribution: null,
      sizeBytes: null,
      tileType: "raster",
      presentation: manifest.assets[0]!.presentation,
    });
    const archive = await buildArchivalHtml({
      project: story,
      manifest,
      projectDirectory: project,
      mapSnapshots: {
        sites: 'data:image/png;base64,aGVsbG8=" onerror="alert(1)',
      },
    });
    expect(archive).not.toContain('href="javascript:');
    expect(archive).not.toContain('onerror="alert(1)');
    expect(archive).toContain("Map snapshot unavailable");
  });

  it("serializes concurrent latest builds for the same project", async () => {
    const { project, viewer } = await setup();
    const results = await Promise.all([
      buildLatestPublication({
        projectDirectory: project,
        viewerDirectory: viewer,
      }),
      buildLatestPublication({
        projectDirectory: project,
        viewerDirectory: viewer,
      }),
    ]);
    expect(results[0].directory).toBe(results[1].directory);
    expect(
      JSON.parse(
        await readFile(join(results[0].directory, "publication.json"), "utf8"),
      ),
    ).toHaveProperty("schema", "earth-stories/publication/v1");
  });

  it("escapes embed attributes and preserves the fixed iframe scrollport", () => {
    const snippet = createEmbedSnippet({
      publicationUrl: "https://example.com/story/",
      title: 'A "river" story',
    });
    expect(snippet).toContain('src="https://example.com/story/embed.html"');
    expect(snippet).toContain("height:100vh");
    expect(snippet).toContain("A &quot;river&quot; story");
    expect(() =>
      createEmbedSnippet({
        publicationUrl: "javascript:alert(1)",
        title: "Unsafe",
      }),
    ).toThrow("HTTP or HTTPS");
  });

  it("preflights and copies remote geospatial data for a portable profile", async () => {
    const { root, project } = await setup();
    const story = await readProject(project);
    story.publication = { profile: "portable", theme: "cng" };
    story.sources.push({
      id: "rain",
      kind: "cog",
      label: "Rain",
      locator: "https://example.com/rain.tif",
      attribution: null,
      sizeBytes: null,
      delivery: "auto",
    });
    story.chapters.push({
      id: "rain-map",
      type: "map",
      title: "Rain",
      narrative: "",
      sourceId: "rain",
      camera: { center: [0, 0], zoom: 2, bearing: 0, pitch: 0 },
    });
    await writeFile(join(project, "story.json"), JSON.stringify(story));
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) =>
      init?.method === "HEAD"
        ? new Response(null, {
            status: 200,
            headers: { "content-length": "8" },
          })
        : new Response("cog-data", { status: 200 }),
    );
    const preflight = await preflightPublication(project);
    expect(preflight.ready).toBe(true);
    expect(preflight.profile).toBe("portable");
    expect(preflight.estimatedIncludedBytes).toBeGreaterThanOrEqual(8);
    const output = join(root, "portable-output");
    await buildPublication({
      projectDirectory: project,
      outputDirectory: output,
    });
    expect(await readFile(join(output, "assets", "rain.tif"), "utf8")).toBe(
      "cog-data",
    );
  });
});

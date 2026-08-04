import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildLatestPublication } from "./build.js";
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
});

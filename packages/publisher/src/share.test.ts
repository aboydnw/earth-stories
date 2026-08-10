import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  storyProjectSchema,
  type StoryProject,
} from "@earth-stories/story-schema";
import {
  buildShareKit,
  injectShareMeta,
  shareDescription,
  PUBLICATION_URL_PLACEHOLDER,
} from "./share.js";

async function fixture(): Promise<StoryProject> {
  return storyProjectSchema.parse(
    JSON.parse(
      await readFile(
        join(process.cwd(), "fixtures/field-notes/story.json"),
        "utf8",
      ),
    ),
  );
}

describe("shareDescription", () => {
  it("prefers the story description", async () => {
    const project = await fixture();
    project.metadata.description = "  Coastal erosion, mapped over a decade.  ";
    expect(shareDescription(project)).toBe(
      "Coastal erosion, mapped over a decade.",
    );
  });

  it("falls back to the first chapter with a narrative", async () => {
    const project = await fixture();
    project.metadata.description = "";
    project.chapters[0]!.narrative = "";
    project.chapters[1]!.narrative = "The shoreline moved.";
    expect(shareDescription(project)).toBe("The shoreline moved.");
  });

  it("truncates long text on a word boundary", async () => {
    const project = await fixture();
    project.metadata.description = `${"word ".repeat(80)}end`;
    const description = shareDescription(project)!;
    expect(description.length).toBeLessThanOrEqual(201);
    expect(description.endsWith("…")).toBe(true);
    expect(description).not.toContain("wor…");
  });

  it("returns null when the story offers no text", async () => {
    const project = await fixture();
    project.metadata.description = "";
    for (const chapter of project.chapters) chapter.narrative = "";
    expect(shareDescription(project)).toBeNull();
  });
});

describe("buildShareKit", () => {
  it("renders placeholder-based metadata before the author deploys", async () => {
    const project = await fixture();
    const kit = buildShareKit({ project });
    expect(kit.metaTags).toContain(
      `content="${PUBLICATION_URL_PLACEHOLDER}/share/card-1.png"`,
    );
    expect(kit.metaTags).toContain('name="twitter:card"');
    expect(kit.postText).toContain(PUBLICATION_URL_PLACEHOLDER);
  });

  it("renders absolute URLs once a publication URL is known", async () => {
    const project = await fixture();
    const kit = buildShareKit({
      project,
      publicationUrl: "https://example.org/story/",
    });
    expect(kit.metaTags).toContain(
      'content="https://example.org/story/share/card-1.png"',
    );
    expect(kit.metaTags).toContain('content="https://example.org/story/"');
    expect(kit.metaTags).not.toContain(PUBLICATION_URL_PLACEHOLDER);
  });

  it("escapes markup in the story title", async () => {
    const project = await fixture();
    project.metadata.title = 'Rivers & "Deltas" <2026>';
    const kit = buildShareKit({ project });
    expect(kit.metaTags).toContain(
      'content="Rivers &amp; &quot;Deltas&quot; &lt;2026&gt;"',
    );
  });

  it("omits description tags when the story has no text", async () => {
    const project = await fixture();
    project.metadata.description = "";
    for (const chapter of project.chapters) chapter.narrative = "";
    const kit = buildShareKit({ project });
    expect(kit.description).toBeNull();
    expect(kit.metaTags).not.toContain("og:description");
  });

  it("rejects a publication URL that is not HTTP or HTTPS", async () => {
    const project = await fixture();
    expect(() =>
      buildShareKit({ project, publicationUrl: "ftp://example.org/story" }),
    ).toThrow();
  });
});

describe("injectShareMeta", () => {
  it("inserts the metadata before the closing head tag", () => {
    const result = injectShareMeta(
      "<!doctype html><html><head><title>x</title></head><body></body></html>",
      '<meta name="a" content="b">',
    );
    expect(result).toContain('<title>x</title><meta name="a" content="b">');
    expect(result.indexOf("<meta")).toBeLessThan(result.indexOf("</head>"));
  });

  it("inserts after the doctype when the document has no head", () => {
    const result = injectShareMeta(
      '<!doctype html><script type="module" src="./assets/viewer.js"></script>',
      '<meta name="a" content="b">',
    );
    expect(result.startsWith('<!doctype html><meta name="a"')).toBe(true);
  });

  it("replaces a previously injected block instead of duplicating it", async () => {
    const project = await fixture();
    const first = buildShareKit({ project });
    const second = buildShareKit({
      project,
      publicationUrl: "https://example.org/story",
    });
    const once = injectShareMeta(
      "<!doctype html><html><head></head><body></body></html>",
      first.metaTags,
    );
    const twice = injectShareMeta(once, second.metaTags);
    expect(twice).not.toContain(PUBLICATION_URL_PLACEHOLDER);
    expect(twice.match(/og:title/g)).toHaveLength(1);
  });
});

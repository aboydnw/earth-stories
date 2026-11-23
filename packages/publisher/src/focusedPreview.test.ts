import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultSourceProvenance,
  projectSourceSchema,
  storyProjectSchema,
} from "@earth-stories/story-schema";
import { compileFocusedChapter } from "./focusedPreview.js";

const fixturePath = join(process.cwd(), "fixtures/field-notes/story.json");

async function fixture() {
  return storyProjectSchema.parse(
    JSON.parse(await readFile(fixturePath, "utf8")) as unknown,
  );
}

describe("compileFocusedChapter", () => {
  it("ignores unrelated broken chapters and invalid unreferenced sources", async () => {
    const project = await fixture();
    project.sources.push({
      id: "invalid-local",
      kind: "local-geojson",
      label: "Invalid local source",
      path: "data/invalid.geojson",
      attribution: null,
      sizeBytes: 10,
      delivery: "connected",
      provenance: defaultSourceProvenance,
    });
    project.chapters.push({
      id: "broken-image",
      type: "image",
      title: "Broken image",
      narrative: "",
      sourceId: "missing-image",
      alt: "",
      caption: "",
    });

    const result = compileFocusedChapter(project, "sites");

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected focused preview");
    expect(result.manifest.chapters.map(({ id }) => id)).toEqual(["sites"]);
    expect(result.manifest.assets.map(({ id }) => id)).toEqual([
      "survey-sites",
    ]);
    expect(project.chapters).toHaveLength(3);
    expect(project.sources).toHaveLength(2);
  });

  it("returns bounded errors for missing and invalid selected chapters", async () => {
    const project = await fixture();

    expect(compileFocusedChapter(project, "not-there")).toEqual({
      status: "error",
      code: "missing-chapter",
      message: "The selected chapter is no longer available.",
    });

    const selected = project.chapters.find(({ id }) => id === "sites");
    if (!selected || selected.type !== "map")
      throw new Error("Fixture map chapter is missing");
    selected.sourceId = "missing-source";
    const invalid = compileFocusedChapter(project, "sites");
    expect(invalid.status).toBe("error");
    if (invalid.status !== "error") throw new Error("Expected compile error");
    expect(invalid.code).toBe("compile-failed");
    expect(invalid.message).toContain("references missing source");
  });

  it("includes every overlay source used by the focused chapter", async () => {
    const project = await fixture();
    const selected = project.chapters.find(({ id }) => id === "sites");
    if (!selected || selected.type !== "map")
      throw new Error("Fixture map chapter is missing");
    const overlay = projectSourceSchema.parse({
      ...project.sources[0],
      id: "flood-overlay",
      label: "Flood overlay",
      path: "data/flood-overlay.geojson",
    });
    project.sources.push(overlay);
    selected.overlaySourceIds = [overlay.id];

    const result = compileFocusedChapter(project, selected.id);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected focused preview");
    expect(result.manifest.assets.map(({ id }) => id)).toEqual([
      "survey-sites",
      "flood-overlay",
    ]);
  });
});

it("keeps the selected continuous scene while excluding unrelated incomplete chapters", async () => {
  const project = await fixture();
  const { visualSequenceSchema } = await import("@earth-stories/story-schema");
  const prose = [
    { id: "a", type: "prose" as const, title: "A", narrative: "First" },
    { id: "b", type: "prose" as const, title: "B", narrative: "Second" },
  ];
  project.chapters.unshift(...prose);
  project.visualSequences = [
    visualSequenceSchema.parse({
      id: "visual",
      alt: "Drawing",
      caption: "",
      scene: {
        width: 1000,
        height: 800,
        layers: [{ id: "line", kind: "path", pathData: "M 0 0 L 1 1" }],
      },
      steps: [
        { chapterId: "a", start: 0, end: 0.5 },
        { chapterId: "b", start: 0.5, end: 1 },
      ],
    }),
  ];
  project.chapters.push({
    id: "unfinished",
    type: "image",
    title: "Draft",
    narrative: "",
    sourceId: "missing",
    alt: "",
    caption: "",
  });
  const before = structuredClone(project);
  for (const id of ["a", "b", "sites"]) {
    const result = compileFocusedChapter(project, id);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error(result.message);
    expect(result.manifest.chapters.map((c) => c.id)).toEqual(
      id === "sites" ? ["sites"] : ["a", "b"],
    );
    expect(result.manifest.visualSequences?.length ?? 0).toBe(
      id === "sites" ? 0 : 1,
    );
  }
  expect(project).toEqual(before);
});

it("keeps only companion artwork for the focused chapter", async () => {
  const project = await fixture();
  const { visualAccentSchema } = await import("@earth-stories/story-schema");
  project.visualAccents = project.chapters.map((chapter, i) =>
    visualAccentSchema.parse({
      id: `accent-${i}`,
      chapterId: chapter.id,
      placement: "trailing",
      alt: `Artwork ${i}`,
      scene: {
        width: 1000,
        height: 500,
        layers: [{ id: "line", kind: "path", pathData: "M 0 0 L 1 1" }],
      },
    }),
  );
  const before = structuredClone(project);
  for (const chapter of project.chapters) {
    const result = compileFocusedChapter(project, chapter.id);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw Error(result.message);
    expect(result.manifest.visualAccents?.map((a) => a.chapterId)).toEqual([
      chapter.id,
    ]);
  }
  expect(project).toEqual(before);
});

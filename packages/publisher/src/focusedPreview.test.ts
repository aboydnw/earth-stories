import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultSourceProvenance,
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
});

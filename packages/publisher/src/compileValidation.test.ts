import { describe, expect, it } from "vitest";
import {
  createDefaultSourceProvenance,
  projectSourceSchema,
  type ProjectChapter,
  type ProjectSource,
} from "@earth-stories/story-schema";
import {
  chapterCompileIssues,
  sourceCompileIssue,
} from "./compileValidation.js";

const provenance = createDefaultSourceProvenance();

describe("compile validation", () => {
  it("uses a readable message when a chapter has no selected source", () => {
    const chapter = {
      id: "map",
      type: "map",
      title: "Flooding",
      narrative: "",
      sourceId: "",
      camera: { center: [0, 20], zoom: 1.5, bearing: 0, pitch: 0 },
    } as ProjectChapter;

    expect(chapterCompileIssues(chapter, new Map())[0]?.message).toBe(
      'Chapter "Flooding" has no source selected',
    );
  });

  it("names the actual chapter type for incompatible geospatial sources", () => {
    const image = projectSourceSchema.parse({
      id: "photo",
      kind: "image",
      label: "Photo",
      path: "data/photo.jpg",
      delivery: "included",
      provenance,
    });
    const chapter = {
      id: "tour",
      type: "scrolly",
      title: "Tour",
      narrative: "",
      sourceId: image.id,
      camera: { center: [0, 20], zoom: 1.5, bearing: 0, pitch: 0 },
    } as ProjectChapter;

    expect(
      chapterCompileIssues(chapter, new Map([[image.id, image]]))[0]?.message,
    ).toBe('Scrolly chapter "Tour" requires a geospatial source');
  });

  it("validates remote XYZ template locators", () => {
    const source = projectSourceSchema.parse({
      id: "tiles",
      kind: "xyz",
      label: "Tiles",
      locator: "https://localhost/{z}/{x}/{y}.png",
      tileType: "raster",
      delivery: "connected",
      provenance,
    }) as ProjectSource;

    expect(sourceCompileIssue(source)).toMatchObject({
      code: "invalid-source",
      resourceId: "tiles",
      message: "Remote assets cannot use private or local network hosts.",
    });
  });
});

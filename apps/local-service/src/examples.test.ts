import { describe, expect, it } from "vitest";
import { storyProjectSchema } from "@earth-stories/story-schema";
import { compileProject } from "@earth-stories/publisher";
import {
  exampleCatalog,
  exampleConnections,
  findExampleStory,
} from "./examples.js";

describe("example catalog", () => {
  it("ships editable stories that satisfy the current project contract", () => {
    const catalog = exampleCatalog();
    expect(catalog.stories.length).toBeGreaterThanOrEqual(2);
    for (const summary of catalog.stories) {
      const story = findExampleStory(summary.id);
      const validated = storyProjectSchema.parse(story);
      expect(validated.chapters).toHaveLength(summary.chapterCount);
      expect(compileProject(validated).chapters).toHaveLength(
        summary.chapterCount,
      );
    }
  });

  it("uses public supported connection formats", () => {
    expect(exampleConnections.length).toBeGreaterThanOrEqual(3);
    for (const connection of exampleConnections) {
      expect(new URL(connection.locator).protocol).toBe("https:");
      expect([
        "cog",
        "pmtiles",
        "geoparquet",
        "xyz",
        "zarr",
        "trajectory",
        "copc",
      ]).toContain(connection.kind);
    }
  });

  it("uses a working geospatial video in the rich-media example", () => {
    const story = findExampleStory("rich-media");
    const video = story?.chapters.find((chapter) => chapter.type === "video");

    expect(video).toMatchObject({
      provider: "youtube",
      videoId: "4E6yQLoGO2o",
      originalUrl: "https://www.youtube.com/watch?v=4E6yQLoGO2o",
    });
  });
});

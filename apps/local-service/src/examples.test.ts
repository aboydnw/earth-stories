import { describe, expect, it } from "vitest";
import { storyProjectSchema } from "@earth-stories/story-schema";
import { compileProject } from "@earth-stories/publisher";
import {
  exampleCatalog,
  exampleConnections,
  findExampleStory,
} from "./examples.js";
import { loadExampleAssetFiles } from "./exampleAssets.js";

describe("example catalog", () => {
  it("uses the reviewed UNDP CGAZ archives with compatible layers and cameras", () => {
    const adm0Url =
      "https://undpngddlsgeohubdev01.blob.core.windows.net/admin/cgaz/ADM0.pmtiles";
    const adm1Url =
      "https://undpngddlsgeohubdev01.blob.core.windows.net/admin/cgaz/ADM1.pmtiles";
    expect(
      exampleConnections.find(({ id }) => id === "countries-pmtiles"),
    ).toMatchObject({ locator: adm0Url });
    expect(
      exampleConnections.find(({ id }) => id === "regions-pmtiles"),
    ).toMatchObject({ locator: adm1Url });

    for (const id of ["boundaries", "rich-media", "storm-track"]) {
      const story = storyProjectSchema.parse(findExampleStory(id));
      for (const source of story.sources) {
        if (source.kind !== "pmtiles") continue;
        expect(source.locator).toBe(
          source.id === "countries" ? adm0Url : adm1Url,
        );
        expect(source.presentation?.sourceLayer).toBe("admin");
      }
    }

    const boundaries = storyProjectSchema.parse(findExampleStory("boundaries"));
    for (const chapter of boundaries.chapters) {
      if (
        (chapter.type === "map" || chapter.type === "scrolly") &&
        chapter.sourceId === "countries"
      )
        expect(chapter.camera.zoom).toBeLessThanOrEqual(3);
    }
    for (const id of ["rich-media", "storm-track"]) {
      const story = storyProjectSchema.parse(findExampleStory(id));
      for (const chapter of story.chapters) {
        if (
          (chapter.type === "map" || chapter.type === "scrolly") &&
          chapter.overlaySourceIds?.includes("regions")
        ) {
          expect(chapter.camera.zoom).toBeGreaterThanOrEqual(4);
          expect(chapter.camera.zoom).toBeLessThanOrEqual(5);
        }
      }
    }
  });

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
      const requiresNetwork =
        /^https?:\/\//i.test(validated.basemap.styleUrl) ||
        validated.sources.some(
          (source) =>
            "locator" in source && /^https?:\/\//i.test(source.locator),
        ) ||
        validated.chapters.some((chapter) => chapter.type === "video");
      expect(summary.authoringConnectivity).toBe(
        requiresNetwork ? "network-required" : "local",
      );
    }
  });

  it("bundles a real asset file for every included image, csv, and trajectory source", async () => {
    const catalog = exampleCatalog();
    for (const summary of catalog.stories) {
      const story = findExampleStory(summary.id);
      const validated = storyProjectSchema.parse(story);
      const includedFiles = await loadExampleAssetFiles(validated.id);
      const bundledPaths = new Set(includedFiles.map((file) => file.path));
      for (const source of validated.sources) {
        if (source.delivery !== "included") continue;
        if (source.kind !== "image" && source.kind !== "csv") continue;
        expect(bundledPaths.has(source.path)).toBe(true);
        const file = includedFiles.find((item) => item.path === source.path);
        expect(file?.contents.byteLength).toBeGreaterThan(0);
      }
      for (const source of validated.sources) {
        if (
          source.kind !== "trajectory" ||
          source.delivery !== "included" ||
          /^https?:\/\//i.test(source.locator)
        ) {
          continue;
        }
        expect(bundledPaths.has(source.locator)).toBe(true);
      }
    }
  });

  it("gives the storm-track example a trajectory whose track spans real time", () => {
    const story = findExampleStory("storm-track");
    const validated = storyProjectSchema.parse(story);
    const trajectory = validated.sources.find(
      (source) => source.kind === "trajectory",
    );
    expect(trajectory).toBeDefined();
    const scrollyChapters = validated.chapters.filter(
      (chapter) => chapter.type === "scrolly",
    );
    expect(scrollyChapters.length).toBeGreaterThanOrEqual(3);
    const positions = scrollyChapters.map(
      (chapter) => chapter.temporalPosition,
    );
    for (const position of positions) {
      expect(position).toBeGreaterThanOrEqual(0);
      expect(position).toBeLessThanOrEqual(1);
    }
    expect(new Set(positions).size).toBe(positions.length);
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

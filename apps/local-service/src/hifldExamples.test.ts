import { describe, expect, it } from "vitest";
import { compileProject } from "@earth-stories/publisher";
import { storyProjectSchema } from "@earth-stories/story-schema";
import { findExampleStory } from "./examples.js";

const expectedSources = {
  earthquakes: [
    "significant-earthquakes",
    "plate-boundaries",
    "holocene-volcanoes",
    "quaternary-faults",
    "tsunami-events",
    "tsunami-observations",
    "significant-volcanic-events",
  ],
  "electric-grid": [
    "power-plants",
    "generating-units",
    "transmission-lines",
    "nerc-regions",
    "reliability-coordinators",
    "retail-service-territories",
    "electric-planning-areas",
    "natural-gas-pipelines",
    "alternative-fueling-stations",
  ],
};

describe.each(Object.entries(expectedSources))(
  "%s HIFLD example",
  (storyId, sourceIds) => {
    it("is a compilable 12-chapter story using every approved chapter type", () => {
      const story = storyProjectSchema.parse(findExampleStory(storyId));

      expect(story.chapters).toHaveLength(12);
      expect(new Set(story.chapters.map(({ type }) => type))).toEqual(
        new Set(["prose", "map", "scrolly", "chart", "flyover", "image"]),
      );
      expect(compileProject(story).chapters).toHaveLength(12);
    });

    it("pins connected HIFLD PMTiles and records matching API provenance", () => {
      const story = storyProjectSchema.parse(findExampleStory(storyId));

      for (const sourceId of sourceIds) {
        const source = story.sources.find(({ id }) => id === sourceId);
        expect(source).toMatchObject({
          kind: "pmtiles",
          tileType: "vector",
          delivery: "connected",
        });
        if (!source || source.kind !== "pmtiles") {
          throw new Error(`Missing HIFLD PMTiles source: ${sourceId}`);
        }
        const match = source.locator.match(
          /^https:\/\/hifld\.publicenvirodata\.org\/storage\/([^/]+)\/\1\/v1\.0\.0\/pmtiles\/\1\.pmtiles$/,
        );
        expect(match).not.toBeNull();
        expect(source.provenance.sourceUrl).toBe(
          `https://hifld.publicenvirodata.org/api/collections/hifld/datasets/${match?.[1]}`,
        );
        expect(source.provenance.accessedAt).toBe("2026-08-17");
      }
    });
  },
);

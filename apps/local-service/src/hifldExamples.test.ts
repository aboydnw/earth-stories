import { describe, expect, it } from "vitest";
import { compileProject } from "@earth-stories/publisher";
import { storyProjectSchema } from "@earth-stories/story-schema";
import { findExampleStory } from "./examples.js";

const expectedSources = {
  earthquakes: {
    "significant-earthquakes": "historical-significant-earthquake-locations",
    "plate-boundaries": "plate-boundaries",
    "holocene-volcanoes": "historical-holocene-volcano-locations",
    "quaternary-faults": "quaternary-fault-lines",
    "tsunami-events": "historical-tsunami-event-locations",
    "tsunami-observations": "historical-tsunami-observations",
    "significant-volcanic-events":
      "historical-significant-volcanic-event-locations",
  },
  "electric-grid": {
    "power-plants": "power-plants-1",
    "generating-units": "generating-units-1",
    "transmission-lines": "transmission-lines-1",
    "nerc-regions": "nerc-regions",
    "reliability-coordinators": "nerc-reliability-coordinators-1",
    "retail-service-territories": "electric-retail-service-territories",
    "electric-planning-areas": "electric-planning-areas",
    "natural-gas-pipelines": "natural-gas-interstate-and-intrastate-pipelines",
    "alternative-fueling-stations": "alternative-fueling-stations",
  },
};

describe.each(Object.entries(expectedSources))(
  "%s HIFLD example",
  (storyId, sourceSlugs) => {
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

      for (const [sourceId, slug] of Object.entries(sourceSlugs)) {
        const source = story.sources.find(({ id }) => id === sourceId);
        expect(source).toMatchObject({
          kind: "pmtiles",
          tileType: "vector",
          delivery: "connected",
        });
        if (!source || source.kind !== "pmtiles") {
          throw new Error(`Missing HIFLD PMTiles source: ${sourceId}`);
        }
        expect(source.locator).toBe(
          `https://hifld.publicenvirodata.org/storage/${slug}/${slug}/v1.0.0/pmtiles/${slug}.pmtiles`,
        );
        expect(source.provenance.sourceUrl).toBe(
          `https://hifld.publicenvirodata.org/api/collections/hifld/datasets/${slug}`,
        );
        expect(source.provenance.accessedAt).toBe("2026-08-17");
      }
    });
  },
);

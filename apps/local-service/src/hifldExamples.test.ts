import { describe, expect, it } from "vitest";
import { compileProject } from "@earth-stories/publisher";
import { storyProjectSchema } from "@earth-stories/story-schema";
import { loadExampleAssetFiles } from "./exampleAssets.js";
import { findExampleStory } from "./examples.js";

const expectedPmtilesSources = {
  earthquakes: {
    "significant-earthquakes": "historical-significant-earthquake-locations",
    "plate-boundaries": "plate-boundaries",
    "holocene-volcanoes": "historical-holocene-volcano-locations",
    "quaternary-faults": "quaternary-fault-lines",
    "tsunami-events": "historical-tsunami-event-locations-",
    "tsunami-observations": "historical-tsunami-observations",
    "significant-volcanic-events":
      "historical-significant-volcanic-event-locations",
  },
  "electric-grid": {
    "power-plants": "power-plants-1",
    "transmission-lines": "transmission-lines-1",
    "nerc-regions": "nerc-regions",
    "reliability-coordinators": "nerc-reliability-coordinators-1",
    "retail-service-territories": "electric-retail-service-territories",
    "electric-planning-areas": "electric-planning-areas",
    "natural-gas-pipelines": "natural-gas-interstate-and-intrastate-pipelines",
    "alternative-fueling-stations": "alternative-fueling-stations",
  },
};

describe.each(Object.entries(expectedPmtilesSources))(
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
        expect(source.provenance.accessedAt).toBe("2026-08-18");
      }

      expect(
        story.sources
          .filter(
            (source) =>
              source.kind === "pmtiles" &&
              source.locator.startsWith(
                "https://hifld.publicenvirodata.org/storage/",
              ),
          )
          .map(({ id }) => id),
      ).toEqual(Object.keys(sourceSlugs));
    });
  },
);

describe("live HIFLD catalog corrections", () => {
  it("uses the audited historical record horizons", () => {
    const earthquakes = storyProjectSchema.parse(
      findExampleStory("earthquakes"),
    );
    const expectedEnds = {
      "significant-earthquakes": "2008-12-31",
      "tsunami-events": "2025-12-31",
      "tsunami-observations": "2005-12-31",
      "significant-volcanic-events": "2024-12-31",
    };

    for (const [sourceId, end] of Object.entries(expectedEnds)) {
      expect(
        earthquakes.sources.find(({ id }) => id === sourceId)?.provenance
          .temporalCoverage?.end,
      ).toBe(end);
    }
  });

  it("treats generating units as included non-spatial data", () => {
    const grid = storyProjectSchema.parse(findExampleStory("electric-grid"));
    const units = grid.sources.find(({ id }) => id === "generating-units");

    expect(units).toMatchObject({
      kind: "csv",
      path: "assets/generating-units.csv",
      delivery: "included",
      provenance: {
        dataUpdatedAt: "2023-09-01",
        accessedAt: "2026-08-18",
        sourceUrl:
          "https://hifld.publicenvirodata.org/storage/generating-units-1/generating-units-1/v1.0.0/geojson/generating-units-1-geojson.geojson",
        transformations: expect.arrayContaining([
          expect.stringContaining("Mapped TYPE values"),
        ]),
      },
    });
    expect(
      grid.chapters.find(({ id }) => id === "grid-generating-units"),
    ).toMatchObject({
      type: "chart",
      sourceId: "generating-units",
      xColumn: "technology_family",
      yColumn: "unit_count",
    });
    expect(
      grid.sources.find(({ id }) => id === "alternative-fueling-stations")
        ?.provenance,
    ).toMatchObject({
      dataUpdatedAt: "2025-10-22",
      temporalCoverage: { end: "2025-10-22" },
    });
  });

  it("bundles the audited generating-unit summary", async () => {
    const assets = await loadExampleAssetFiles("example-electric-grid");
    const asset = assets.find(
      ({ path }) => path === "assets/generating-units.csv",
    );
    const [header, ...lines] = new TextDecoder()
      .decode(asset?.contents)
      .trim()
      .split("\n");
    const rows = lines.map((line) => {
      const [technologyFamily, unitCount, summerCapacityMw] = line.split(",");
      return {
        technologyFamily,
        unitCount: Number(unitCount),
        summerCapacityMw: Number(summerCapacityMw),
      };
    });

    expect(header).toBe("technology_family,unit_count,summer_capacity_mw");
    expect(rows).toEqual([
      {
        technologyFamily: "Natural gas",
        unitCount: 8078,
        summerCapacityMw: 635778,
      },
      { technologyFamily: "Solar", unitCount: 7214, summerCapacityMw: 176513 },
      {
        technologyFamily: "Petroleum",
        unitCount: 5307,
        summerCapacityMw: 52917,
      },
      {
        technologyFamily: "Hydroelectric",
        unitCount: 4511,
        summerCapacityMw: 107772,
      },
      {
        technologyFamily: "Biomass and waste",
        unitCount: 2213,
        summerCapacityMw: 13197,
      },
      { technologyFamily: "Wind", unitCount: 1764, summerCapacityMw: 175180 },
      {
        technologyFamily: "Other and storage",
        unitCount: 1651,
        summerCapacityMw: 59344,
      },
      { technologyFamily: "Coal", unitCount: 1176, summerCapacityMw: 294789 },
      {
        technologyFamily: "Geothermal",
        unitCount: 313,
        summerCapacityMw: 3391,
      },
      { technologyFamily: "Nuclear", unitCount: 117, summerCapacityMw: 107664 },
    ]);
    expect(rows.reduce((total, row) => total + row.unitCount, 0)).toBe(32344);
  });
});

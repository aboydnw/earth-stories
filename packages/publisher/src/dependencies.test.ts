import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseStoryProject } from "@earth-stories/story-schema";
import {
  inventoryBasemapStyleResources,
  inventoryPublicationDependencies,
  NEUTRAL_BASEMAP_STYLE,
} from "./dependencies.js";

const fixturePath = join(process.cwd(), "fixtures/field-notes/story.json");

async function projectWith(
  profile: "connected" | "portable" | "offline",
  additions: any[],
) {
  const legacy = JSON.parse(await readFile(fixturePath, "utf8")) as any;
  return parseStoryProject({
    ...legacy,
    schema: "earth-stories/project/v2",
    publication: {
      ...legacy.publication,
      profile,
      offlineBasemap: { mode: "neutral" },
    },
    sources: [...legacy.sources, ...additions],
  });
}

describe("inventoryPublicationDependencies", () => {
  it("proves the neutral basemap has no transitive network resources", () => {
    expect(
      inventoryBasemapStyleResources(JSON.parse(NEUTRAL_BASEMAP_STYLE)),
    ).toEqual([]);
    expect(
      inventoryBasemapStyleResources({
        version: 8,
        sprite: "https://example.com/sprite",
        glyphs: "https://example.com/{fontstack}/{range}.pbf",
        sources: {
          tiles: {
            type: "vector",
            tiles: ["https://example.com/{z}/{x}/{y}.pbf"],
          },
          geojson: {
            type: "geojson",
            data: "https://example.com/features.geojson",
          },
        },
        imports: [
          { id: "labels", url: "https://example.com/labels.json" },
          { id: "inline", data: { version: 8 } },
        ],
      }),
    ).toEqual([
      "https://example.com/features.geojson",
      "https://example.com/labels.json",
      "https://example.com/sprite",
      "https://example.com/{fontstack}/{range}.pbf",
      "https://example.com/{z}/{x}/{y}.pbf",
    ]);
  });
  it.each([
    ["local-geojson", { path: "roads.geojson" }, "included"],
    ["image", { path: "photo.webp" }, "included"],
    ["csv", { path: "values.csv" }, "included"],
    [
      "pmtiles",
      { locator: "https://example.com/a.pmtiles", tileType: "vector" },
      "included",
    ],
    ["geoparquet", { locator: "https://example.com/a.parquet" }, "included"],
    [
      "cog",
      {
        locator: "https://example.com/a.tif",
        cog: { epsg: 32618, definition: "+proj=utm +zone=18" },
      },
      "included",
    ],
    [
      "trajectory",
      { locator: "https://example.com/a.json", trailLength: 60 },
      "included",
    ],
    [
      "copc",
      {
        locator: "https://example.com/a.copc.laz",
        colorMode: "rgb",
        pointSize: 2,
      },
      "included",
    ],
    ["xyz", { locator: "https://example.com/{z}/{x}/{y}.png" }, "unsupported"],
    [
      "zarr",
      { locator: "https://example.com/a.zarr", variable: "v" },
      "unsupported",
    ],
  ] as const)("classifies offline %s as %s", async (kind, fields, delivery) => {
    const project = await projectWith("offline", [
      { id: `case-${kind}`, label: kind, kind, delivery: "auto", ...fields },
    ]);
    const dependency = inventoryPublicationDependencies(project).find(
      ({ id }) => id === `source:case-${kind}:data`,
    );
    expect(dependency).toMatchObject({
      id: `source:case-${kind}:data`,
      owner: { type: "source", id: `case-${kind}` },
      delivery,
    });
  });

  it("inventories neutral basemap, video, terrain, buildings, COG projection, and GeoParquet runtime", async () => {
    const project = await projectWith("offline", [
      {
        id: "parquet",
        label: "Parquet",
        kind: "geoparquet",
        locator: "data.parquet",
        delivery: "included",
      },
      {
        id: "dem",
        label: "DEM",
        kind: "cog",
        locator: "dem.tif",
        delivery: "included",
        cog: { epsg: 32618, definition: "+proj=utm +zone=18" },
      },
    ]);
    project.chapters.push(
      {
        id: "video",
        type: "video",
        title: "Video",
        narrative: "",
        provider: "youtube",
        videoId: "abc",
        originalUrl: "https://youtube.com/watch?v=abc",
      },
      {
        id: "terrain",
        type: "map",
        title: "Terrain",
        narrative: "",
        sourceId: project.sources[0]!.id,
        camera: {
          center: [0, 0],
          zoom: 2,
          bearing: 0,
          pitch: 0,
          terrain: { enabled: true, exaggeration: 1 },
          buildings: true,
        },
      },
    );

    const inventory = inventoryPublicationDependencies(project);
    expect(inventory.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "basemap:neutral:style",
        "chapter:video:video",
        "chapter:terrain:terrain",
        "chapter:terrain:buildings",
        "source:dem:projection",
        "runtime:duckdb:duckdb-eh.wasm",
        "runtime:duckdb:spatial-eh",
      ]),
    );
    expect(
      inventory.find(({ id }) => id === "chapter:video:video"),
    ).toMatchObject({ delivery: "unsupported" });
  });

  it("keeps stable IDs and honors every source delivery choice", async () => {
    const project = await projectWith("portable", [
      {
        id: "auto",
        label: "Auto",
        kind: "pmtiles",
        locator: "https://example.com/auto.pmtiles",
        tileType: "vector",
        delivery: "auto",
      },
      {
        id: "included",
        label: "Included",
        kind: "pmtiles",
        locator: "https://example.com/included.pmtiles",
        tileType: "vector",
        delivery: "included",
      },
      {
        id: "connected",
        label: "Connected",
        kind: "pmtiles",
        locator: "https://example.com/connected.pmtiles",
        tileType: "vector",
        delivery: "connected",
      },
    ]);
    const first = inventoryPublicationDependencies(project);
    const second = inventoryPublicationDependencies(project);
    expect(second).toEqual(first);
    expect(
      first
        .filter(({ owner }) => owner.type === "source")
        .map(({ id, delivery }) => ({ id, delivery })),
    ).toEqual(
      expect.arrayContaining([
        { id: "source:auto:data", delivery: "included" },
        { id: "source:included:data", delivery: "included" },
        { id: "source:connected:data", delivery: "connected" },
      ]),
    );
  });
});

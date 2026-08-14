import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultSourceProvenance,
  parseStoryProject,
  projectChapterSchema,
  sourceProvenanceSchema,
  projectSourceSchema,
  storyProjectSchema,
} from "./project.js";
import { publicationAssetSchema } from "./publication.js";

describe("storyProjectSchema", () => {
  it("migrates v1 projects losslessly to v2 with the neutral offline basemap default", async () => {
    const legacy = JSON.parse(
      await readFile(
        join(process.cwd(), "fixtures/field-notes/story.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;

    const migrated = parseStoryProject(legacy);

    expect(migrated.schema).toBe("earth-stories/project/v2");
    expect(migrated.publication).toEqual({
      ...(legacy.publication as object),
      offlineBasemap: { mode: "neutral" },
    });
    expect(migrated).toMatchObject({
      id: legacy.id,
      metadata: legacy.metadata,
      basemap: legacy.basemap,
      sources: legacy.sources,
      dataAssets: legacy.dataAssets ?? [],
      chapters: legacy.chapters,
    });
  });

  it("accepts the offline profile in project v2", async () => {
    const legacy = JSON.parse(
      await readFile(
        join(process.cwd(), "fixtures/field-notes/story.json"),
        "utf8",
      ),
    ) as Record<string, any>;
    const project = parseStoryProject({
      ...legacy,
      schema: "earth-stories/project/v2",
      publication: {
        ...legacy.publication,
        profile: "offline",
        offlineBasemap: { mode: "neutral" },
      },
    });

    expect(project.publication.profile).toBe("offline");
  });

  it("defaults the optional COG projection on legacy publication assets", () => {
    const asset = publicationAssetSchema.parse({
      id: "legacy-cog",
      label: "Legacy COG",
      kind: "cog",
      delivery: "included",
      href: "assets/legacy-cog.tif",
      attribution: null,
      sizeBytes: 901_326,
      tileType: "raster",
      presentation: {
        opacity: 1,
        color: "#336699",
        strokeColor: "#ffffff",
        radius: 4,
        sourceLayer: null,
        rasterBand: 1,
        rescale: null,
        colormap: "viridis",
        legendTitle: "",
        legendVisible: false,
        symbolProperty: null,
        categoryColors: {},
        filterProperty: null,
        filterValue: null,
      },
      zarr: null,
      trajectory: null,
      copc: null,
    });

    expect(asset.cog).toBeNull();
  });

  it("accepts the representative project", async () => {
    const fixture = JSON.parse(
      await readFile(
        join(process.cwd(), "fixtures/field-notes/story.json"),
        "utf8",
      ),
    ) as unknown;
    const parsed = storyProjectSchema.parse(fixture);
    expect(parsed.id).toBe("field-notes");
    expect(parsed.sources[0]?.provenance).toEqual(defaultSourceProvenance);
  });

  it("normalizes full and partial provenance", () => {
    expect(sourceProvenanceSchema.parse({ publisher: "USGS" })).toEqual({
      ...defaultSourceProvenance,
      publisher: "USGS",
    });
    expect(
      sourceProvenanceSchema.parse({
        publisher: "Open Data Office",
        sourceUrl: "https://example.org/data",
        licenseName: "CC BY 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        dataUpdatedAt: "2026-07-01",
        accessedAt: "2026-08-01T12:30:00Z",
        staleAfterDays: 30,
        temporalCoverage: { start: "2020-01-01", end: "2025-12-31" },
        spatialCoverage: "Lower Mekong basin",
        transformations: ["Reprojected to EPSG:4326", "Filtered invalid rows"],
      }),
    ).toMatchObject({
      staleAfterDays: 30,
      spatialCoverage: "Lower Mekong basin",
    });
  });

  it("creates independent provenance defaults for every parsed source", () => {
    const first = projectSourceSchema.parse({
      id: "first",
      label: "First",
      kind: "local-geojson",
      path: "first.geojson",
    });
    const second = projectSourceSchema.parse({
      id: "second",
      label: "Second",
      kind: "local-geojson",
      path: "second.geojson",
    });
    first.provenance.transformations.push("Changed first source");
    expect(second.provenance.transformations).toEqual([]);
    expect(first.provenance).not.toBe(second.provenance);
  });

  it("rejects unsafe provenance URLs, invalid dates, and freshness windows", () => {
    expect(() =>
      sourceProvenanceSchema.parse({ sourceUrl: "javascript:alert(1)" }),
    ).toThrow();
    expect(() =>
      sourceProvenanceSchema.parse({ licenseUrl: "file:///tmp/license" }),
    ).toThrow();
    expect(() =>
      sourceProvenanceSchema.parse({
        sourceUrl: "https://reader:secret@example.org/data",
      }),
    ).toThrow();
    expect(() =>
      sourceProvenanceSchema.parse({ staleAfterDays: -1 }),
    ).toThrow();
    expect(() =>
      sourceProvenanceSchema.parse({ dataUpdatedAt: "July-ish" }),
    ).toThrow();
  });

  it("adds the shared provenance shape to every source kind", () => {
    const common = { id: "source", label: "Source" };
    const sources = [
      { ...common, kind: "local-geojson", path: "data.geojson" },
      {
        ...common,
        kind: "pmtiles",
        locator: "data.pmtiles",
        tileType: "vector",
      },
      { ...common, kind: "geoparquet", locator: "data.parquet" },
      { ...common, kind: "image", path: "image.jpg" },
      { ...common, kind: "csv", path: "data.csv" },
      { ...common, kind: "cog", locator: "data.tif" },
      {
        ...common,
        kind: "xyz",
        locator: "https://example.org/{z}/{x}/{y}.png",
      },
      {
        ...common,
        kind: "zarr",
        locator: "https://example.org/data.zarr",
        variable: "temperature",
      },
      {
        ...common,
        kind: "trajectory",
        locator: "trips.json",
        trailLength: 600,
      },
      {
        ...common,
        kind: "copc",
        locator: "cloud.copc.laz",
        colorMode: "elevation",
        pointSize: 2,
      },
    ];
    for (const source of sources)
      expect(projectSourceSchema.parse(source).provenance).toEqual(
        defaultSourceProvenance,
      );
  });

  it("rejects hosted workspace-shaped data", async () => {
    const fixture = JSON.parse(
      await readFile(
        join(process.cwd(), "fixtures/field-notes/story.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(() =>
      storyProjectSchema.parse({
        ...fixture,
        workspace_id: "abcd1234",
        chapters: [],
      }),
    ).toThrow();
  });

  it("reports unsupported persisted schema versions explicitly", () => {
    expect(() =>
      parseStoryProject({ schema: "earth-stories/project/v99" }),
    ).toThrow("Unsupported Earth Stories project schema");
  });

  it("returns a failed safeParse result for malformed v1 projects", () => {
    expect(() =>
      storyProjectSchema.safeParse({ schema: "earth-stories/project/v1" }),
    ).not.toThrow();
    expect(
      storyProjectSchema.safeParse({ schema: "earth-stories/project/v1" })
        .success,
    ).toBe(false);
  });

  it("defaults legacy flyover keyframe captions independently", () => {
    const flyover = projectChapterSchema.parse({
      id: "flight",
      type: "flyover",
      title: "Flight",
      narrative: "Follow the route",
      keyframes: [
        { center: [0, 0], zoom: 2, bearing: 0, pitch: 20 },
        { center: [1, 1], zoom: 3, bearing: 45, pitch: 30 },
      ],
    });
    if (flyover.type !== "flyover") throw new Error("Expected flyover");
    expect(flyover.keyframes.map(({ caption }) => caption)).toEqual(["", ""]);
    flyover.keyframes[0]!.caption = "First view";
    expect(flyover.keyframes[1]!.caption).toBe("");
  });
});

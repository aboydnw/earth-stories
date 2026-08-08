import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileProject } from "./compile.js";

const fixturePath = join(process.cwd(), "fixtures/field-notes/story.json");

describe("compileProject", () => {
  it("is deterministic and includes local assets", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as unknown;
    const first = compileProject(fixture);
    const second = compileProject(fixture);

    expect(second).toEqual(first);
    expect(first.build.id).toBe(first.build.projectDigest.slice(0, 16));
    expect(first.assets).toContainEqual(
      expect.objectContaining({ id: "survey-sites", delivery: "included" }),
    );
    expect(first.externalDependencies).toContainEqual(
      expect.objectContaining({ resourceId: "carto-positron" }),
    );
    expect(first.build.projectDigest).toMatch(/^[0-9a-f]{64}$/);

    const changedTimestamp = compileProject({
      ...(fixture as any),
      metadata: {
        ...(fixture as any).metadata,
        updated: new Date().toISOString(),
      },
    });
    expect(changedTimestamp.build.projectDigest).toBe(
      first.build.projectDigest,
    );
  });

  it("compiles image, chart, scrolly, and connected asset policies", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as any;
    fixture.sources.push(
      {
        id: "photo",
        kind: "image",
        label: "River",
        path: "assets/river.jpg",
        attribution: null,
        sizeBytes: 12,
        delivery: "included",
      },
      {
        id: "values",
        kind: "csv",
        label: "Readings",
        path: "assets/readings.csv",
        attribution: null,
        sizeBytes: 20,
        delivery: "included",
      },
      {
        id: "rain",
        kind: "cog",
        label: "Rain",
        locator: "https://example.com/rain.tif",
        attribution: null,
        sizeBytes: null,
        delivery: "auto",
      },
    );
    fixture.chapters.push(
      {
        id: "image",
        type: "image",
        title: "River",
        narrative: "",
        sourceId: "photo",
        alt: "River",
        caption: "At dawn",
      },
      {
        id: "chart",
        type: "chart",
        title: "Readings",
        narrative: "",
        sourceId: "values",
        chartType: "bar",
        xColumn: "label",
        yColumn: "value",
      },
      {
        id: "scroll",
        type: "scrolly",
        title: "Rain",
        narrative: "",
        sourceId: "rain",
        camera: { center: [0, 0], zoom: 2, bearing: 0, pitch: 0 },
        temporalPosition: 0.5,
      },
    );
    const result = compileProject(fixture);
    expect(result.chapters.map((chapter) => chapter.type)).toEqual(
      expect.arrayContaining(["image", "chart", "scrolly"]),
    );
    expect(result.assets.find((asset) => asset.id === "rain")?.delivery).toBe(
      "connected",
    );
    expect(
      result.chapters.find((chapter) => chapter.id === "scroll"),
    ).toMatchObject({ temporalPosition: 0.5 });
    expect(
      result.externalDependencies.find((item) => item.resourceId === "rain")
        ?.requirements,
    ).toContain("byte-ranges");
  });

  it("preserves property styling, filtering, and raster presentation controls", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as any;
    fixture.sources[0].presentation = {
      opacity: 0.7,
      color: "#cf3f02",
      strokeColor: "#443f3f",
      radius: 7,
      sourceLayer: null,
      rasterBand: 2,
      rescale: [0, 100],
      colormap: "terrain",
      legendTitle: "Land cover",
      legendVisible: true,
      symbolProperty: "class",
      categoryColors: { forest: "#2f7d32" },
      filterProperty: "status",
      filterValue: "current",
    };
    const asset = compileProject(fixture).assets.find(
      (candidate) => candidate.id === fixture.sources[0].id,
    );
    expect(asset?.presentation).toMatchObject({
      rasterBand: 2,
      rescale: [0, 100],
      colormap: "terrain",
      symbolProperty: "class",
      categoryColors: { forest: "#2f7d32" },
      filterProperty: "status",
      filterValue: "current",
    });
  });

  it("copies normalized provenance into publication assets and the digest", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as any;
    const original = compileProject(fixture);
    fixture.sources[0].provenance = {
      publisher: "River Observatory",
      sourceUrl: "https://example.org/survey",
      licenseName: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      dataUpdatedAt: "2026-07-01",
      accessedAt: "2026-08-01",
      staleAfterDays: 60,
      temporalCoverage: { start: "2025-01-01", end: "2026-07-01" },
      spatialCoverage: "Survey reach",
      transformations: ["Removed duplicate observations"],
    };
    const compiled = compileProject(fixture);
    expect(compiled.assets[0]?.provenance).toEqual(
      fixture.sources[0].provenance,
    );
    expect(compiled.build.projectDigest).not.toBe(original.build.projectDigest);
  });

  it("rejects broken source references and incompatible delivery overrides", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as any;
    fixture.chapters.push({
      id: "broken",
      type: "image",
      title: "Broken",
      narrative: "",
      sourceId: "missing",
      alt: "",
      caption: "",
    });
    expect(() => compileProject(fixture)).toThrow("references missing source");
    fixture.chapters.pop();
    fixture.sources[0].delivery = "connected";
    expect(() => compileProject(fixture)).toThrow(
      "cannot use connected delivery",
    );
  });

  it("applies publication profile defaults while preserving per-asset overrides", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as any;
    fixture.sources.push(
      {
        id: "rain",
        kind: "cog",
        label: "Rain",
        locator: "https://example.com/rain.tif",
        attribution: null,
        sizeBytes: 2048,
        delivery: "auto",
      },
      {
        id: "boundaries",
        kind: "pmtiles",
        tileType: "vector",
        label: "Boundaries",
        locator: "https://example.com/boundaries.pmtiles",
        attribution: null,
        sizeBytes: 1024,
        delivery: "connected",
      },
    );
    fixture.publication.profile = "portable";
    const portable = compileProject(fixture);
    expect(portable.assets.find((asset) => asset.id === "rain")).toMatchObject({
      delivery: "included",
      href: "assets/rain.tif",
    });
    expect(
      portable.assets.find((asset) => asset.id === "boundaries")?.delivery,
    ).toBe("connected");
    expect(portable.hostingRequirements).toContain("byte-ranges");

    fixture.publication.profile = "connected";
    expect(
      compileProject(fixture).assets.find((asset) => asset.id === "rain")
        ?.delivery,
    ).toBe("connected");
  });

  it("compiles overlays, temporal Zarr, COPC, video, and flyover chapters", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as any;
    fixture.sources.push(
      {
        id: "time",
        kind: "zarr",
        label: "Time",
        locator: "https://example.com/time.zarr",
        variable: "data",
        selection: {},
        timeDimension: "time",
        timesteps: [{ label: "Now", index: 0 }],
        geozarr: null,
        delivery: "auto",
        attribution: null,
        sizeBytes: null,
      },
      {
        id: "cloud",
        kind: "copc",
        label: "Cloud",
        locator: "https://example.com/cloud.copc.laz",
        colorMode: "elevation",
        pointSize: 2,
        delivery: "auto",
        attribution: null,
        sizeBytes: null,
      },
    );
    fixture.chapters.push(
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
        id: "fly",
        type: "flyover",
        title: "Fly",
        narrative: "",
        sourceId: "cloud",
        overlaySourceIds: ["time"],
        keyframes: [
          { center: [0, 0], zoom: 2, bearing: 0, pitch: 0 },
          { center: [1, 1], zoom: 4, bearing: 20, pitch: 45 },
        ],
        scrollLength: 1,
      },
    );
    const result = compileProject(fixture);
    expect(
      result.chapters.find((chapter) => chapter.id === "fly"),
    ).toMatchObject({ type: "flyover", overlayAssetIds: ["time"] });
    expect(result.assets.find((asset) => asset.id === "time")).toMatchObject({
      kind: "zarr",
      delivery: "connected",
      zarr: { timeDimension: "time" },
    });
    expect(result.assets.find((asset) => asset.id === "cloud")?.copc).toEqual({
      colorMode: "elevation",
      pointSize: 2,
    });
  });
});

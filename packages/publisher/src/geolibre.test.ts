import { describe, expect, it } from "vitest";
import type { PublicationManifest } from "@earth-stories/story-schema";
import {
  buildGeoLibreCompanion,
  geolibreContinuationStatus,
} from "./geolibre.js";

function manifest(): PublicationManifest {
  return {
    schema: "earth-stories/publication/v2",
    build: {
      id: "build-123",
      projectId: "coast",
      projectDigest: "a".repeat(64),
      runtimeVersion: "0.1.0",
      dependencyDigests: [],
    },
    metadata: { title: "Coastal change", description: "", author: null },
    publication: { profile: "connected", theme: "cng" },
    basemap: {
      delivery: "connected",
      id: "base",
      label: "Base",
      styleUrl: "https://example.org/style.json",
      attribution: null,
    },
    connectivity: { requested: "connected", state: "pending" },
    dependencies: [],
    projectionDefinitions: [],
    runtimeAssets: [],
    externalDependencies: [],
    hostingRequirements: ["static-http"],
    continuations: [],
    assets: [
      {
        id: "shoreline",
        label: "Shoreline",
        kind: "pmtiles",
        delivery: "included",
        href: "assets/shoreline.pmtiles",
        attribution: "Coastal agency",
        provenance: {
          publisher: "Coastal agency",
          sourceUrl: "https://data.example.org/shoreline",
          licenseName: "CC-BY-4.0",
          licenseUrl: null,
          dataUpdatedAt: null,
          accessedAt: null,
          staleAfterDays: null,
          temporalCoverage: null,
          spatialCoverage: null,
          transformations: ["Simplified to 10 metres"],
        },
        sizeBytes: 42,
        tileType: "vector",
        presentation: {
          opacity: 0.8,
          color: "#336699",
          strokeColor: "#112233",
          radius: 6,
          sourceLayer: "shore",
          rasterBand: 1,
          rescale: null,
          colormap: "viridis",
          colormapReversed: false,
          legendTitle: "Shoreline",
          legendVisible: true,
          symbolProperty: null,
          categoryColors: {},
          filterProperty: null,
          filterValue: null,
        },
        zarr: null,
        cog: null,
        trajectory: null,
        copc: null,
      },
    ],
    chapters: [
      {
        id: "map",
        type: "map",
        title: "Coast",
        narrative: "",
        assetId: "shoreline",
        overlayAssetIds: [],
        camera: { center: [-123, 45], zoom: 7, bearing: 2, pitch: 20 },
        transition: "fly-to",
      },
    ],
  };
}

describe("buildGeoLibreCompanion", () => {
  it("turns published layers into a traceable GeoLibre project", () => {
    const result = buildGeoLibreCompanion({
      manifest: manifest(),
      publicationUrl: "https://stories.example.org/coast/",
    });

    expect(result.includedAssetIds).toEqual(["shoreline"]);
    expect(result.included).toEqual([
      {
        assetId: "shoreline",
        label: "Shoreline",
        publicUrl: "https://stories.example.org/coast/assets/shoreline.pmtiles",
      },
    ]);
    expect(result.project).toMatchObject({
      version: "0.2.0",
      name: "Coastal change",
      mapView: { center: [-123, 45], zoom: 7, bearing: 2, pitch: 20 },
      layers: [
        {
          id: "shoreline",
          type: "pmtiles",
          source: {
            type: "pmtiles",
            url: "https://stories.example.org/coast/assets/shoreline.pmtiles",
          },
          capabilities: { query: true, export: true },
        },
      ],
      metadata: {
        earthStories: {
          buildId: "build-123",
          publicationUrl: "https://stories.example.org/coast/",
        },
      },
    });
    expect(result.launchHref).toContain("https://web.geolibre.app/?url=");
  });

  it.each(["https://stories.example.org/coast", "stories.example.org/coast/"])(
    "keeps the publication folder when resolving included files: %s",
    (publicationUrl) => {
      const result = buildGeoLibreCompanion({
        manifest: manifest(),
        publicationUrl,
      });

      expect(result.project).toMatchObject({
        layers: [
          {
            source: {
              url: "https://stories.example.org/coast/assets/shoreline.pmtiles",
            },
          },
        ],
      });
      expect(result.launchHref).toContain(
        encodeURIComponent(
          "https://stories.example.org/coast/explore/story.geolibre.json",
        ),
      );
    },
  );

  it("preserves XYZ tile template placeholders", () => {
    const value = manifest();
    value.assets[0] = {
      ...value.assets[0]!,
      kind: "xyz",
      delivery: "connected",
      href: "https://tiles.example.org/{z}/{x}/{y}.png",
    };
    const result = buildGeoLibreCompanion({
      manifest: value,
      publicationUrl: "https://stories.example.org/coast/",
    });

    expect(result.project).toMatchObject({
      layers: [
        { source: { url: "https://tiles.example.org/{z}/{x}/{y}.png" } },
      ],
    });
  });

  it.each([
    "http://127.0.0.1/private.pmtiles",
    "https://user:secret@example.org/private.pmtiles",
    "file:///private.pmtiles",
    "https://[::1]/private.pmtiles",
    "https://[fd00::1]/private.pmtiles",
    "https://100.64.0.1/private.pmtiles",
    "https://0.0.0.0/private.pmtiles",
  ])("excludes unsafe connected locations: %s", (href) => {
    const value = manifest();
    value.assets[0] = { ...value.assets[0]!, delivery: "connected", href };
    const result = buildGeoLibreCompanion({
      manifest: value,
      publicationUrl: "https://stories.example.org/coast/",
    });
    expect(result.project).toBeNull();
    expect(result.excluded).toEqual([
      { assetId: "shoreline", reason: "unsafe-url" },
    ]);
  });

  it("excludes unsupported publication formats rather than guessing", () => {
    const value = manifest();
    value.assets[0] = { ...value.assets[0]!, kind: "zarr" };
    const result = buildGeoLibreCompanion({
      manifest: value,
      publicationUrl: "https://stories.example.org/coast/",
    });
    expect(result.project).toBeNull();
    expect(result.excluded[0]?.reason).toBe("unsupported-format");
  });
});

describe("geolibreContinuationStatus", () => {
  it.each([
    ["https://stories.example.org/coast/", "ready"],
    ["stories.example.org/coast", "ready"],
    ["", "needs-url"],
    ["http://stories.example.org/coast/", "needs-url"],
    ["https://localhost:8080/coast/", "needs-url"],
  ] as const)("reports %s as %s", (publicationUrl, status) => {
    expect(geolibreContinuationStatus(manifest(), publicationUrl)).toBe(status);
  });

  it("is unavailable when every layer would be excluded", () => {
    const value = manifest();
    value.assets[0] = {
      ...value.assets[0]!,
      delivery: "connected",
      href: "http://data.example.org/shoreline.pmtiles",
    };
    expect(
      geolibreContinuationStatus(value, "https://stories.example.org/coast/"),
    ).toBe("unavailable");
  });
});

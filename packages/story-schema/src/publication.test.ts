import { describe, expect, it } from "vitest";
import {
  parsePublicationManifest,
  publicationManifestSchema,
} from "./publication.js";

const legacyManifest = {
  schema: "earth-stories/publication/v1",
  build: {
    id: "legacy-build",
    projectId: "legacy-project",
    projectDigest: "a".repeat(64),
    runtimeVersion: "0.1.0",
  },
  metadata: { title: "Legacy", description: "", author: null },
  publication: { profile: "connected", theme: "cng" },
  basemap: {
    id: "legacy-map",
    label: "Legacy map",
    styleUrl: "https://example.com/style.json",
    attribution: null,
  },
  assets: [],
  chapters: [{ id: "intro", type: "prose", title: "Intro", narrative: "" }],
  externalDependencies: [
    {
      resourceId: "legacy-map",
      href: "https://example.com/style.json",
      requirements: ["network", "cors"],
    },
  ],
  hostingRequirements: ["static-http"],
} as const;

describe("publication manifests", () => {
  it("normalizes a v1 basemap and dependency into the v2 contract", () => {
    const parsed = parsePublicationManifest(legacyManifest);

    expect(parsed.schema).toBe("earth-stories/publication/v2");
    expect(parsed.basemap).toEqual({
      delivery: "connected",
      id: "legacy-map",
      label: "Legacy map",
      styleUrl: "https://example.com/style.json",
      attribution: null,
    });
    expect(parsed.connectivity).toEqual({
      requested: "connected",
      state: "pending",
    });
    expect(parsed.dependencies).toContainEqual(
      expect.objectContaining({
        id: "legacy:legacy-map",
        delivery: "connected",
        locator: "https://example.com/style.json",
      }),
    );
  });

  it("synthesizes a missing legacy basemap dependency exactly once", () => {
    const parsed = parsePublicationManifest({
      ...legacyManifest,
      externalDependencies: [],
    });
    expect(
      parsed.dependencies.filter(({ owner }) => owner.type === "basemap"),
    ).toHaveLength(1);
  });

  it.each(["connected", "unsupported"] as const)(
    "rejects an offline v2 manifest containing a %s dependency",
    (delivery) => {
      const dependency =
        delivery === "connected"
          ? {
              id: "source:roads:data",
              owner: { type: "source", id: "roads" },
              locator: "https://example.com/roads.pmtiles",
              estimatedBytes: null,
              delivery,
              materialization: "none",
              requirements: ["network", "cors", "byte-ranges"],
            }
          : {
              id: "source:roads:data",
              owner: { type: "source", id: "roads" },
              locator: "https://example.com/{z}/{x}/{y}.png",
              estimatedBytes: null,
              delivery,
              materialization: "none",
              requirements: ["network", "cors"],
              reason: "XYZ pyramids are unbounded.",
            };
      expect(() =>
        publicationManifestSchema.parse({
          ...parsePublicationManifest(legacyManifest),
          publication: { profile: "offline", theme: "cng" },
          connectivity: { requested: "offline", state: "pending" },
          basemap: {
            delivery: "included",
            id: "neutral",
            label: "Neutral",
            styleHref: "basemap/neutral-style.json",
            attribution: null,
          },
          dependencies: [dependency],
          externalDependencies: [],
        }),
      ).toThrow(/offline/i);
    },
  );

  it("enforces delivery-specific dependency requirements", () => {
    const base = parsePublicationManifest(legacyManifest);
    expect(() =>
      publicationManifestSchema.parse({
        ...base,
        dependencies: [
          {
            id: "source:roads:data",
            owner: { type: "source", id: "roads" },
            locator: "https://example.com/roads.pmtiles",
            estimatedBytes: null,
            delivery: "connected",
            materialization: "none",
            requirements: ["cors"],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects connected assets even when an offline dependency list is empty", () => {
    const base = parsePublicationManifest(legacyManifest);
    expect(() =>
      publicationManifestSchema.parse({
        ...base,
        publication: { profile: "offline", theme: "cng" },
        connectivity: { requested: "offline", state: "pending" },
        basemap: {
          delivery: "included",
          id: "neutral",
          label: "Neutral",
          styleHref: "basemap/neutral-style.json",
          attribution: null,
        },
        assets: [
          {
            id: "roads",
            label: "Roads",
            kind: "pmtiles",
            delivery: "connected",
            href: "https://example.com/roads.pmtiles",
            attribution: null,
            sizeBytes: null,
            tileType: "vector",
            presentation: {
              opacity: 1,
              color: "#000000",
              strokeColor: "#000000",
              radius: 4,
              sourceLayer: null,
              rasterBand: 1,
              rescale: null,
              colormap: "viridis",
              legendTitle: "",
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
        dependencies: [],
        externalDependencies: [],
      }),
    ).toThrow(/connected assets/i);
  });
});

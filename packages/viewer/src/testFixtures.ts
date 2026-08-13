import type { PublicationAsset } from "@earth-stories/story-schema";

export function publicationAsset(
  overrides: Partial<PublicationAsset> = {},
): PublicationAsset {
  return {
    id: "source",
    label: "Source",
    kind: "cog",
    delivery: "connected",
    href: "https://example.org/data.tif",
    attribution: null,
    provenance: {
      publisher: null,
      sourceUrl: null,
      licenseName: null,
      licenseUrl: null,
      dataUpdatedAt: null,
      accessedAt: null,
      staleAfterDays: null,
      temporalCoverage: null,
      spatialCoverage: null,
      transformations: [],
    },
    sizeBytes: null,
    tileType: null,
    presentation: {
      opacity: 1,
      color: "#cf3f02",
      strokeColor: "#443f3f",
      radius: 6,
      sourceLayer: null,
      rasterBand: 2,
      rescale: [0, 100],
      colormap: "viridis",
      legendTitle: "",
      legendVisible: true,
      symbolProperty: null,
      categoryColors: {},
      filterProperty: "status",
      filterValue: "active",
    },
    zarr: null,
    cog: null,
    trajectory: null,
    copc: null,
    ...overrides,
  };
}

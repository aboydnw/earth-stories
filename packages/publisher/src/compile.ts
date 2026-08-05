import type {
  PublicationAsset,
  PublicationManifest,
  ProjectSource,
  StoryProject,
} from "@earth-stories/story-schema";
import {
  publicationManifestSchema,
  storyProjectSchema,
} from "@earth-stories/story-schema";
import { validateRemoteUrl } from "./remote-url.js";

export const RUNTIME_VERSION = "0.1.0";

const DEFAULT_PRESENTATION: PublicationAsset["presentation"] = {
  opacity: 0.85,
  color: "#cf3f02",
  strokeColor: "#443f3f",
  radius: 6,
  sourceLayer: null,
  rasterBand: 1,
  rescale: null,
  colormap: "viridis",
  legendTitle: "",
  legendVisible: true,
};

const HASH_SEEDS = [
  0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f, 0x165667b1,
  0xd3a2646c, 0xfd7046c5,
] as const;

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function digestProject(project: StoryProject): string {
  const input = canonicalize(project);
  return HASH_SEEDS.map((seed) => {
    let hash: number = seed;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }).join("");
}

function compileAsset(
  source: ProjectSource,
  profile: StoryProject["publication"]["profile"],
): PublicationAsset {
  const presentation = {
    ...DEFAULT_PRESENTATION,
    ...source.presentation,
  };
  const specialized = (value?: Partial<PublicationAsset>) => ({
    zarr: null,
    trajectory: null,
    copc: null,
    ...value,
  });
  const requestedDelivery = source.delivery;
  const profileDelivery = (locator: string) => {
    if (/^https?:\/\//.test(locator)) validateRemoteUrl(locator);
    if (requestedDelivery !== "auto") return requestedDelivery;
    if (
      profile === "portable" &&
      source.kind !== "xyz" &&
      source.kind !== "local-geojson" &&
      source.kind !== "image" &&
      source.kind !== "csv" &&
      source.kind !== "zarr"
    )
      return "included";
    return /^https?:\/\//.test(locator) ? "connected" : "included";
  };
  const connected = (locator: string) =>
    profileDelivery(locator) === "connected";
  const extension = (value: string, fallback: string) =>
    value.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase() || fallback;
  switch (source.kind) {
    case "local-geojson":
      return {
        id: source.id,
        label: source.label,
        kind: "geojson",
        delivery: requestedDelivery === "connected" ? "connected" : "included",
        href: `assets/${source.id}.geojson`,
        attribution: source.attribution,
        sizeBytes: source.sizeBytes,
        tileType: null,
        presentation,
        ...specialized(),
      };
    case "pmtiles": {
      const pmtilesConnected = connected(source.locator);
      return {
        id: source.id,
        label: source.label,
        kind: "pmtiles",
        delivery: pmtilesConnected ? "connected" : "included",
        href: pmtilesConnected ? source.locator : `assets/${source.id}.pmtiles`,
        attribution: source.attribution,
        sizeBytes: source.sizeBytes,
        tileType: source.tileType,
        presentation,
        ...specialized(),
      };
    }
    case "geoparquet": {
      const isConnected = connected(source.locator);
      return {
        id: source.id,
        label: source.label,
        kind: "geoparquet",
        delivery: isConnected ? "connected" : "included",
        href: isConnected ? source.locator : `assets/${source.id}.parquet`,
        attribution: source.attribution,
        sizeBytes: source.sizeBytes,
        tileType: null,
        presentation,
        ...specialized(),
      };
    }
    case "image":
      return {
        id: source.id,
        label: source.label,
        kind: "image",
        delivery: "included",
        href: `assets/${source.id}.${extension(source.path, "bin")}`,
        attribution: source.attribution,
        sizeBytes: source.sizeBytes,
        tileType: null,
        presentation,
        ...specialized(),
      };
    case "csv":
      return {
        id: source.id,
        label: source.label,
        kind: "csv",
        delivery: "included",
        href: `assets/${source.id}.csv`,
        attribution: source.attribution,
        sizeBytes: source.sizeBytes,
        tileType: null,
        presentation,
        ...specialized(),
      };
    case "cog": {
      const cogConnected = profileDelivery(source.locator) === "connected";
      return {
        id: source.id,
        label: source.label,
        kind: "cog",
        delivery: cogConnected ? "connected" : "included",
        href: cogConnected ? source.locator : `assets/${source.id}.tif`,
        attribution: source.attribution,
        sizeBytes: source.sizeBytes,
        tileType: null,
        presentation,
        ...specialized(),
      };
    }
    case "xyz":
      return {
        id: source.id,
        label: source.label,
        kind: "xyz",
        delivery: "connected",
        href: source.locator,
        attribution: source.attribution,
        sizeBytes: source.sizeBytes,
        tileType: "raster",
        presentation,
        ...specialized(),
      };
    case "zarr":
      validateRemoteUrl(source.locator);
      return {
        id: source.id,
        label: source.label,
        kind: "zarr",
        delivery: "connected",
        href: source.locator,
        attribution: source.attribution,
        sizeBytes: source.sizeBytes,
        tileType: null,
        presentation,
        ...specialized({
          zarr: {
            variable: source.variable,
            selection: source.selection,
            timeDimension: source.timeDimension,
            timesteps: source.timesteps,
            geozarr: source.geozarr,
          },
        }),
      };
    case "trajectory": {
      const isConnected = connected(source.locator);
      return {
        id: source.id,
        label: source.label,
        kind: "trajectory",
        delivery: isConnected ? "connected" : "included",
        href: isConnected ? source.locator : `assets/${source.id}.json`,
        attribution: source.attribution,
        sizeBytes: source.sizeBytes,
        tileType: null,
        presentation,
        ...specialized({ trajectory: { trailLength: source.trailLength } }),
      };
    }
    case "copc": {
      const isConnected = connected(source.locator);
      return {
        id: source.id,
        label: source.label,
        kind: "copc",
        delivery: isConnected ? "connected" : "included",
        href: isConnected ? source.locator : `assets/${source.id}.copc.laz`,
        attribution: source.attribution,
        sizeBytes: source.sizeBytes,
        tileType: null,
        presentation,
        ...specialized({
          copc: { colorMode: source.colorMode, pointSize: source.pointSize },
        }),
      };
    }
  }
}

export function compileProject(input: unknown): PublicationManifest {
  const project = storyProjectSchema.parse(input);
  const sources = new Map(project.sources.map((source) => [source.id, source]));
  for (const chapter of project.chapters) {
    if (chapter.type === "prose" || chapter.type === "video") continue;
    if ("overlaySourceIds" in chapter) {
      for (const overlayId of chapter.overlaySourceIds ?? []) {
        const overlay = sources.get(overlayId);
        if (!overlay)
          throw new Error(
            `Chapter "${chapter.title}" references missing overlay ${overlayId}`,
          );
        if (overlay.kind === "image" || overlay.kind === "csv")
          throw new Error(
            `Chapter "${chapter.title}" requires geospatial overlays`,
          );
      }
    }
    const sourceId = chapter.sourceId;
    if (!sourceId && chapter.type === "flyover") continue;
    const source = sourceId ? sources.get(sourceId) : undefined;
    if (!source)
      throw new Error(
        `Chapter "${chapter.title}" references missing source ${sourceId}`,
      );
    if (chapter.type === "image" && source.kind !== "image")
      throw new Error(
        `Image chapter "${chapter.title}" requires an image source`,
      );
    if (chapter.type === "chart" && source.kind !== "csv")
      throw new Error(`Chart chapter "${chapter.title}" requires a CSV source`);
    if (
      (chapter.type === "map" ||
        chapter.type === "scrolly" ||
        chapter.type === "flyover") &&
      (source.kind === "image" || source.kind === "csv")
    )
      throw new Error(
        `Map chapter "${chapter.title}" requires a geospatial source`,
      );
  }
  for (const source of project.sources) {
    if (
      (source.kind === "local-geojson" ||
        source.kind === "image" ||
        source.kind === "csv" ||
        (source.kind === "trajectory" &&
          !/^https?:\/\//i.test(source.locator))) &&
      source.delivery === "connected"
    )
      throw new Error(
        `Local source "${source.label}" cannot use connected delivery`,
      );
    if (source.kind === "xyz" && source.delivery === "included")
      throw new Error(
        `XYZ source "${source.label}" cannot be included because it represents many remote tiles`,
      );
    if (source.kind === "zarr" && source.delivery === "included")
      throw new Error(
        `Zarr source "${source.label}" cannot be included yet because it is a multi-file store`,
      );
  }
  const projectDigest = digestProject(project);
  const assets = project.sources.map((source) =>
    compileAsset(source, project.publication.profile),
  );
  const connectedAssets = assets.filter(
    (asset) => asset.delivery === "connected",
  );

  return publicationManifestSchema.parse({
    schema: "earth-stories/publication/v1",
    build: {
      id: projectDigest.slice(0, 16),
      projectId: project.id,
      projectDigest,
      runtimeVersion: RUNTIME_VERSION,
    },
    metadata: {
      title: project.metadata.title,
      description: project.metadata.description,
      author: project.metadata.author,
    },
    publication: project.publication,
    basemap: project.basemap,
    assets,
    chapters: project.chapters.map((chapter) =>
      chapter.type === "map" || chapter.type === "scrolly"
        ? {
            id: chapter.id,
            type: chapter.type,
            title: chapter.title,
            narrative: chapter.narrative,
            camera: chapter.camera,
            assetId: chapter.sourceId,
            overlayAssetIds: chapter.overlaySourceIds ?? [],
            transition: chapter.transition ?? "fly-to",
            ...(chapter.type === "scrolly"
              ? { overlayPosition: chapter.overlayPosition ?? "left" }
              : {}),
          }
        : chapter.type === "image"
          ? {
              id: chapter.id,
              type: chapter.type,
              title: chapter.title,
              narrative: chapter.narrative,
              assetId: chapter.sourceId,
              alt: chapter.alt,
              caption: chapter.caption,
            }
          : chapter.type === "chart"
            ? {
                id: chapter.id,
                type: chapter.type,
                title: chapter.title,
                narrative: chapter.narrative,
                assetId: chapter.sourceId,
                chartType: chapter.chartType,
                xColumn: chapter.xColumn,
                yColumn: chapter.yColumn,
                yColumns: chapter.yColumns ?? [],
                seriesColumn: chapter.seriesColumn ?? null,
                xLabel: chapter.xLabel ?? "",
                yLabel: chapter.yLabel ?? "",
                yScale: chapter.yScale ?? "linear",
                xMin: chapter.xMin ?? null,
                xMax: chapter.xMax ?? null,
              }
            : chapter.type === "video"
              ? {
                  id: chapter.id,
                  type: chapter.type,
                  title: chapter.title,
                  narrative: chapter.narrative,
                  provider: chapter.provider,
                  videoId: chapter.videoId,
                  originalUrl: chapter.originalUrl,
                }
              : chapter.type === "flyover"
                ? {
                    id: chapter.id,
                    type: chapter.type,
                    title: chapter.title,
                    narrative: chapter.narrative,
                    assetId: chapter.sourceId,
                    overlayAssetIds: chapter.overlaySourceIds ?? [],
                    keyframes: chapter.keyframes,
                    scrollLength: chapter.scrollLength,
                  }
                : {
                    id: chapter.id,
                    type: chapter.type,
                    title: chapter.title,
                    narrative: chapter.narrative,
                  },
    ),
    externalDependencies: [
      {
        resourceId: project.basemap.id,
        href: project.basemap.styleUrl,
        requirements: ["network", "cors"],
      },
      ...connectedAssets.map((asset) => ({
        resourceId: asset.id,
        href: asset.href,
        requirements:
          asset.kind === "cog" ||
          asset.kind === "pmtiles" ||
          asset.kind === "geoparquet" ||
          asset.kind === "copc"
            ? (["network", "cors", "byte-ranges"] as const)
            : (["network", "cors"] as const),
      })),
      ...(assets.some((asset) => asset.kind === "geoparquet")
        ? [
            {
              resourceId: "earth-stories-geoparquet-runtime",
              href: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/",
              requirements: ["network", "cors"] as const,
            },
            {
              resourceId: "duckdb-spatial-extension",
              href: "https://extensions.duckdb.org/",
              requirements: ["network", "cors"] as const,
            },
          ]
        : []),
      ...(assets.some((asset) => asset.kind === "cog")
        ? [
            {
              resourceId: "cog-epsg-resolver",
              href: "https://epsg.io/",
              requirements: ["network", "cors"] as const,
            },
          ]
        : []),
    ],
    hostingRequirements: [
      "static-http",
      ...(assets.some(
        (asset) =>
          asset.delivery === "included" &&
          ["cog", "pmtiles", "geoparquet", "copc"].includes(asset.kind),
      )
        ? (["byte-ranges"] as const)
        : []),
    ],
  });
}

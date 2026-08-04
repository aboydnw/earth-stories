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

export const RUNTIME_VERSION = "0.1.0";

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

function compileAsset(source: ProjectSource): PublicationAsset {
  const requestedDelivery = source.delivery;
  const connected = (locator: string) =>
    requestedDelivery === "connected" ||
    (requestedDelivery === "auto" && /^https?:\/\//.test(locator));
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
      };
    case "pmtiles":
      const pmtilesConnected = connected(source.locator);
      return {
        id: source.id,
        label: source.label,
        kind: "pmtiles",
        delivery: pmtilesConnected ? "connected" : "included",
        href: pmtilesConnected ? source.locator : `assets/${source.id}.pmtiles`,
        attribution: source.attribution,
        sizeBytes: source.sizeBytes,
      };
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
      };
    case "cog":
      return {
        id: source.id,
        label: source.label,
        kind: "cog",
        delivery: "connected",
        href: source.locator,
        attribution: source.attribution,
        sizeBytes: source.sizeBytes,
      };
    case "xyz":
      return {
        id: source.id,
        label: source.label,
        kind: "xyz",
        delivery: "connected",
        href: source.locator,
        attribution: source.attribution,
        sizeBytes: source.sizeBytes,
      };
  }
}

export function compileProject(input: unknown): PublicationManifest {
  const project = storyProjectSchema.parse(input);
  const sources = new Map(project.sources.map((source) => [source.id, source]));
  for (const chapter of project.chapters) {
    if (chapter.type === "prose") continue;
    const source = sources.get(chapter.sourceId);
    if (!source)
      throw new Error(
        `Chapter "${chapter.title}" references missing source ${chapter.sourceId}`,
      );
    if (chapter.type === "image" && source.kind !== "image")
      throw new Error(
        `Image chapter "${chapter.title}" requires an image source`,
      );
    if (chapter.type === "chart" && source.kind !== "csv")
      throw new Error(`Chart chapter "${chapter.title}" requires a CSV source`);
    if (
      (chapter.type === "map" || chapter.type === "scrolly") &&
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
        source.kind === "csv") &&
      source.delivery === "connected"
    )
      throw new Error(
        `Local source "${source.label}" cannot use connected delivery`,
      );
    if (
      (source.kind === "cog" || source.kind === "xyz") &&
      source.delivery === "included"
    )
      throw new Error(
        `${source.kind.toUpperCase()} source "${source.label}" is connected-only in the MVP`,
      );
  }
  const projectDigest = digestProject(project);
  const assets = project.sources.map(compileAsset);
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
          asset.kind === "cog" || asset.kind === "pmtiles"
            ? (["network", "cors", "byte-ranges"] as const)
            : (["network", "cors"] as const),
      })),
    ],
  });
}

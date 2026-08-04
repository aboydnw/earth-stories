import type {
  PublicationAsset,
  PublicationManifest,
  ProjectSource,
  StoryProject,
} from "@devseed-stories/story-schema";
import {
  publicationManifestSchema,
  storyProjectSchema,
} from "@devseed-stories/story-schema";

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
  switch (source.kind) {
    case "local-geojson":
      return {
        id: source.id,
        label: source.label,
        kind: "geojson",
        delivery: "included",
        href: `assets/${source.id}.geojson`,
        attribution: source.attribution,
        sizeBytes: source.sizeBytes,
      };
    case "pmtiles":
      return {
        id: source.id,
        label: source.label,
        kind: "pmtiles",
        delivery: source.locator.startsWith("http") ? "connected" : "included",
        href: source.locator.startsWith("http")
          ? source.locator
          : `assets/${source.id}.pmtiles`,
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
  const projectDigest = digestProject(project);
  const assets = project.sources.map(compileAsset);
  const connectedAssets = assets.filter(
    (asset) => asset.delivery === "connected",
  );

  return publicationManifestSchema.parse({
    schema: "devseed-stories/publication/v1",
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
      chapter.type === "map"
        ? {
            id: chapter.id,
            type: chapter.type,
            title: chapter.title,
            narrative: chapter.narrative,
            camera: chapter.camera,
            assetId: chapter.sourceId,
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

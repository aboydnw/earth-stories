import type {
  PublicationAsset,
  PublicationChapter,
  PublicationManifest,
  ProjectChapter,
  ProjectSource,
  StoryProject,
} from "@earth-stories/story-schema";
import {
  publicationManifestSchema,
  parseStoryProject,
} from "@earth-stories/story-schema";
import { projectCompileIssues } from "./compileValidation.js";
import {
  inventoryBasemapStyleResources,
  inventoryPublicationDependencies,
  NEUTRAL_BASEMAP_STYLE,
  NEUTRAL_BASEMAP_STYLE_HREF,
  type PublicationDependencyPlan,
} from "./dependencies.js";

export const RUNTIME_VERSION = "0.1.0";

const DEFAULT_PRESENTATION: PublicationAsset["presentation"] = {
  opacity: 0.85,
  color: "#cf3f02",
  strokeColor: "#443f3f",
  radius: 6,
  sourceLayer: null,
  rasterBand: 1,
  rescale: null,
  colormap: "viridis" as const,
  colormapReversed: false,
  legendTitle: "",
  legendVisible: true,
  symbolProperty: null,
  categoryColors: {},
  filterProperty: null,
  filterValue: null,
};

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
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

function digestBytes(input: Uint8Array): string {
  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 2 ** 32), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  const rotateRight = (value: number, amount: number) =>
    (value >>> amount) | (value << (32 - amount));

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15] ?? 0;
      const previous2 = words[index - 2] ?? 0;
      const sigma0 =
        rotateRight(previous15, 7) ^
        rotateRight(previous15, 18) ^
        (previous15 >>> 3);
      const sigma1 =
        rotateRight(previous2, 17) ^
        rotateRight(previous2, 19) ^
        (previous2 >>> 10);
      words[index] =
        ((words[index - 16] ?? 0) +
          sigma0 +
          (words[index - 7] ?? 0) +
          sigma1) >>>
        0;
    }

    let a = state[0]!;
    let b = state[1]!;
    let c = state[2]!;
    let d = state[3]!;
    let e = state[4]!;
    let f = state[5]!;
    let g = state[6]!;
    let h = state[7]!;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temporary1 =
        (h + sum1 + choose + SHA256_CONSTANTS[index]! + words[index]!) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = (state[0]! + a) >>> 0;
    state[1] = (state[1]! + b) >>> 0;
    state[2] = (state[2]! + c) >>> 0;
    state[3] = (state[3]! + d) >>> 0;
    state[4] = (state[4]! + e) >>> 0;
    state[5] = (state[5]! + f) >>> 0;
    state[6] = (state[6]! + g) >>> 0;
    state[7] = (state[7]! + h) >>> 0;
  }

  return [...state]
    .map((value) => value.toString(16).padStart(8, "0"))
    .join("");
}

function digestCanonical(value: unknown): string {
  return digestBytes(new TextEncoder().encode(canonicalize(value)));
}

export function digestText(value: string): string {
  return digestBytes(new TextEncoder().encode(value));
}

export function digestProject(project: StoryProject): string {
  const { updated: _updated, ...stableMetadata } = project.metadata;
  return digestCanonical({ ...project, metadata: stableMetadata });
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
    provenance: source.provenance,
    zarr: null,
    cog: null,
    trajectory: null,
    copc: null,
    ...value,
  });
  const requestedDelivery = source.delivery;
  const profileDelivery = (locator: string) => {
    if (requestedDelivery !== "auto") return requestedDelivery;
    if (
      (profile === "portable" || profile === "offline") &&
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
        ...specialized({ cog: source.cog ?? null }),
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

function assertNever(value: never): never {
  throw new Error(`Unsupported chapter type: ${JSON.stringify(value)}`);
}

function compileChapter(chapter: ProjectChapter): PublicationChapter {
  const base = {
    id: chapter.id,
    title: chapter.title,
    narrative: chapter.narrative,
  };

  switch (chapter.type) {
    case "prose":
      return { ...base, type: "prose" };
    case "map":
      return {
        ...base,
        type: "map",
        camera: chapter.camera,
        assetId: chapter.sourceId,
        overlayAssetIds: chapter.overlaySourceIds ?? [],
        transition: chapter.transition ?? "fly-to",
        temporalPosition: chapter.temporalPosition,
      };
    case "scrolly":
      return {
        ...base,
        type: "scrolly",
        camera: chapter.camera,
        assetId: chapter.sourceId,
        overlayAssetIds: chapter.overlaySourceIds ?? [],
        transition: chapter.transition ?? "fly-to",
        overlayPosition: chapter.overlayPosition ?? "left",
        temporalPosition: chapter.temporalPosition,
      };
    case "image":
      return {
        ...base,
        type: "image",
        assetId: chapter.sourceId,
        alt: chapter.alt,
        caption: chapter.caption,
      };
    case "chart":
      return {
        ...base,
        type: "chart",
        assetId: chapter.sourceId,
        series: chapter.series,
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
      };
    case "video":
      return {
        ...base,
        type: "video",
        provider: chapter.provider,
        videoId: chapter.videoId,
        originalUrl: chapter.originalUrl,
      };
    case "flyover":
      return {
        ...base,
        type: "flyover",
        assetId: chapter.sourceId,
        overlayAssetIds: chapter.overlaySourceIds ?? [],
        keyframes: chapter.keyframes,
        scrollLength: chapter.scrollLength,
      };
    default:
      return assertNever(chapter);
  }
}

export interface CompileProjectOptions {
  dependencyDigests?: Readonly<Record<string, string>>;
}

function resolvedDependencies(
  inventory: PublicationDependencyPlan[],
  offline: boolean,
) {
  const missing = inventory.filter(
    (dependency) =>
      dependency.delivery === "included" && !("sha256" in dependency),
  );
  if (offline && missing.length)
    throw new Error(
      `Offline compilation requires resolved SHA-256 digests for: ${missing.map(({ id }) => id).join(", ")}`,
    );
  return inventory.map((dependency) => {
    if (dependency.delivery !== "included" || "sha256" in dependency)
      return dependency;
    return {
      id: dependency.id,
      owner: dependency.owner,
      locator: dependency.locator,
      estimatedBytes: dependency.estimatedBytes,
      delivery: "unsupported" as const,
      materialization: "none" as const,
      requirements: dependency.requirements,
      reason:
        "Included bytes have not been materialized and verified with a SHA-256 digest.",
    };
  });
}

export function compileProject(
  input: unknown,
  options: CompileProjectOptions = {},
): PublicationManifest {
  const project = parseStoryProject(input);
  const [issue] = projectCompileIssues(project);
  if (issue) throw new Error(issue.message);
  const projectDigest = digestProject(project);
  const assets = project.sources.map((source) =>
    compileAsset(source, project.publication.profile),
  );
  const inventory = inventoryPublicationDependencies(project, options).map(
    (dependency) => {
      if (
        dependency.delivery !== "included" ||
        "sha256" in dependency ||
        !dependency.id.endsWith(":projection")
      )
        return dependency;
      const source = project.sources.find(
        ({ id }) => id === dependency.owner.id,
      );
      return source?.kind === "cog" && source.cog
        ? { ...dependency, sha256: digestText(source.cog.definition) }
        : dependency;
    },
  );
  const dependencies = resolvedDependencies(
    inventory,
    project.publication.profile === "offline",
  );
  const dependencyDigests = dependencies
    .filter(
      (
        dependency,
      ): dependency is Extract<
        (typeof dependencies)[number],
        { delivery: "included" }
      > => dependency.delivery === "included",
    )
    .map(({ id, sha256 }) => ({ id, sha256 }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const buildId = dependencyDigests.length
    ? digestCanonical({ projectDigest, dependencyDigests }).slice(0, 16)
    : projectDigest.slice(0, 16);
  const connectedDependencies = dependencies.filter(
    ({ delivery }) => delivery === "connected",
  );
  if (
    project.publication.profile === "offline" &&
    inventoryBasemapStyleResources(JSON.parse(NEUTRAL_BASEMAP_STYLE)).length
  )
    throw new Error("The neutral offline basemap has undeclared resources");

  return publicationManifestSchema.parse({
    schema: "earth-stories/publication/v2",
    build: {
      id: buildId,
      projectId: project.id,
      projectDigest,
      runtimeVersion: RUNTIME_VERSION,
      dependencyDigests,
    },
    metadata: {
      title: project.metadata.title,
      description: project.metadata.description,
      author: project.metadata.author,
    },
    publication: {
      profile: project.publication.profile,
      theme: project.publication.theme,
    },
    basemap:
      project.publication.profile === "offline"
        ? {
            delivery: "included",
            id: "neutral",
            label: "Neutral",
            styleHref: NEUTRAL_BASEMAP_STYLE_HREF,
            attribution: null,
          }
        : { delivery: "connected", ...project.basemap },
    assets,
    chapters: project.chapters.map(compileChapter),
    connectivity: {
      requested: project.publication.profile,
      state: "pending",
    },
    dependencies,
    externalDependencies: connectedDependencies.map((dependency) => ({
      resourceId:
        dependency.locator === "https://epsg.io/"
          ? "cog-epsg-resolver"
          : dependency.owner.id,
      href: dependency.locator,
      requirements: dependency.requirements,
    })),
    projectionDefinitions: project.sources.flatMap((source) =>
      source.kind === "cog" && source.cog ? [source.cog] : [],
    ),
    runtimeAssets: dependencies.flatMap((dependency) =>
      dependency.delivery === "included" && dependency.owner.type === "runtime"
        ? [
            {
              id: dependency.id,
              href: dependency.locator,
              sha256: dependency.sha256,
            },
          ]
        : [],
    ),
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

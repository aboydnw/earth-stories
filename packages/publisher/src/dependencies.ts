import type {
  PublicationDependency,
  ProjectChapter,
  ProjectSource,
  StoryProject,
} from "@earth-stories/story-schema";

export const NEUTRAL_BASEMAP_STYLE_HREF = "basemap/neutral-style.json";
export const NEUTRAL_BASEMAP_STYLE =
  '{"version":8,"name":"Earth Stories Neutral","sources":{},"layers":[{"id":"background","type":"background","paint":{"background-color":"#ebe8e2"}}]}\n';
export const NEUTRAL_BASEMAP_STYLE_SHA256 =
  "1f5d54bbf73d656a147f0e046255b9538816ea810c58036bf539417f351e43e3";

type Requirement = "network" | "cors" | "byte-ranges";
type Owner = PublicationDependency["owner"];

export type PublicationDependencyPlan =
  | PublicationDependency
  | {
      id: string;
      owner: Owner;
      locator: string;
      estimatedBytes: number | null;
      delivery: "included";
      materialization: "copy-local" | "download-file" | "bundle-runtime";
      requirements: Array<"byte-ranges">;
      sha256?: string;
    };

export interface DependencyInventoryOptions {
  dependencyDigests?: Readonly<Record<string, string>>;
}

const byteRangeKinds = new Set<ProjectSource["kind"]>([
  "pmtiles",
  "geoparquet",
  "cog",
  "copc",
]);

function isRemote(locator: string): boolean {
  return /^https?:\/\//i.test(locator);
}

function sourceLocator(source: ProjectSource): string {
  return source.kind === "local-geojson" ||
    source.kind === "image" ||
    source.kind === "csv"
    ? source.path
    : source.locator;
}

function includedLocator(source: ProjectSource): string {
  switch (source.kind) {
    case "local-geojson":
      return `assets/${source.id}.geojson`;
    case "image": {
      const extension =
        source.path.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase() || "bin";
      return `assets/${source.id}.${extension}`;
    }
    case "csv":
      return `assets/${source.id}.csv`;
    case "pmtiles":
      return `assets/${source.id}.pmtiles`;
    case "geoparquet":
      return `assets/${source.id}.parquet`;
    case "cog":
      return `assets/${source.id}.tif`;
    case "trajectory":
      return `assets/${source.id}.json`;
    case "copc":
      return `assets/${source.id}.copc.laz`;
    case "xyz":
    case "zarr":
      return source.locator;
  }
}

function sourceDelivery(
  source: ProjectSource,
  profile: StoryProject["publication"]["profile"],
): "included" | "connected" | "unsupported" {
  if (profile === "offline") {
    if (source.kind === "xyz" || source.kind === "zarr") return "unsupported";
    return source.delivery === "connected" ? "unsupported" : "included";
  }
  if (
    source.kind === "local-geojson" ||
    source.kind === "image" ||
    source.kind === "csv"
  )
    return "included";
  if (source.kind === "xyz" || source.kind === "zarr") return "connected";
  if (source.delivery !== "auto") return source.delivery;
  if (profile === "portable") return "included";
  return isRemote(sourceLocator(source)) ? "connected" : "included";
}

function included(
  id: string,
  owner: Owner,
  locator: string,
  sourceLocatorValue: string,
  estimatedBytes: number | null,
  digest: string | undefined,
  byteRanges = false,
  materialization?: "copy-local" | "download-file" | "bundle-runtime",
): PublicationDependencyPlan {
  return {
    id,
    owner,
    locator,
    estimatedBytes,
    delivery: "included",
    materialization:
      materialization ??
      (isRemote(sourceLocatorValue) ? "download-file" : "copy-local"),
    requirements: byteRanges ? ["byte-ranges"] : [],
    ...(digest ? { sha256: digest } : {}),
  };
}

function connected(
  id: string,
  owner: Owner,
  locator: string,
  estimatedBytes: number | null,
  byteRanges = false,
): PublicationDependency {
  return {
    id,
    owner,
    locator,
    estimatedBytes,
    delivery: "connected",
    materialization: "none",
    requirements: [
      "network",
      "cors",
      ...(byteRanges ? ["byte-ranges" as const] : []),
    ],
  };
}

function unsupported(
  id: string,
  owner: Owner,
  locator: string,
  reason: string,
  requirements: Requirement[] = ["network", "cors"],
): PublicationDependency {
  return {
    id,
    owner,
    locator,
    estimatedBytes: null,
    delivery: "unsupported",
    materialization: "none",
    requirements,
    reason,
  };
}

const duckDbRuntime = [
  [
    "duckdb-browser-mvp.worker.js",
    "b0387027f174e2b60c2d5cfa31cecca9b89d8a9762346b6449a784cd1c4dde3c",
    844_644,
  ],
  [
    "duckdb-mvp.wasm",
    "45d72a81fba8e57693d890da837c7041310e385e75619a8559839b15388dfe97",
    39_362_651,
  ],
  [
    "duckdb-browser-eh.worker.js",
    "f8ab72b6b90b3ad83077d47426d4a99d5d9a4c7e07cba1a2be37d655adc7c1ab",
    772_759,
  ],
  [
    "duckdb-eh.wasm",
    "4c221bfa59c11f24dbd750e70c90b9252eca6eec5633936e6a2ec766e55fd879",
    34_242_586,
  ],
  [
    "parquet-mvp",
    "0785c6c95d003eff4faa7b3b4b660f02c9c92f6d68d135ddf330d42e3a650600",
    2_867_304,
  ],
  [
    "spatial-mvp",
    "7a745cfc5259f69b46f077bc6afeb7a6aefb8ef8d8b336bb0b770e5449708bb4",
    23_338_062,
  ],
  [
    "parquet-eh",
    "22765c8f7dc741cda2b571a66ac7bb355295d7d69a6c37e5315b265672984f55",
    3_045_039,
  ],
  [
    "spatial-eh",
    "04b776946da64a15a7b14501790c75093e38f876acc46b2922f0daeb6aaa1d60",
    23_469_719,
  ],
] as const;

function runtimeLocator(name: string): string {
  if (name === "parquet-mvp" || name === "spatial-mvp")
    return `runtime/duckdb/extensions/v1.4.3/wasm_mvp/${name.split("-")[0]}.duckdb_extension.wasm`;
  if (name === "parquet-eh" || name === "spatial-eh")
    return `runtime/duckdb/extensions/v1.4.3/wasm_eh/${name.split("-")[0]}.duckdb_extension.wasm`;
  return `runtime/duckdb/${name}`;
}

export function inventoryBasemapStyleResources(
  style: Record<string, unknown>,
): string[] {
  const locators = new Set<string>();
  for (const key of ["sprite", "glyphs"] as const) {
    const value = style[key];
    if (typeof value === "string") locators.add(value);
  }
  const sources = style.sources;
  if (sources && typeof sources === "object")
    for (const source of Object.values(sources as Record<string, unknown>)) {
      if (!source || typeof source !== "object") continue;
      const resource = source as {
        url?: unknown;
        tiles?: unknown;
        data?: unknown;
      };
      if (typeof resource.url === "string") locators.add(resource.url);
      if (typeof resource.data === "string") locators.add(resource.data);
      if (Array.isArray(resource.tiles))
        for (const tile of resource.tiles)
          if (typeof tile === "string") locators.add(tile);
    }
  const imports = style.imports;
  if (Array.isArray(imports))
    for (const entry of imports) {
      if (!entry || typeof entry !== "object") continue;
      const resource = entry as { url?: unknown; data?: unknown };
      if (typeof resource.url === "string") locators.add(resource.url);
      if (typeof resource.data === "string") locators.add(resource.data);
    }
  return [...locators].sort();
}

function chapterDependencies(
  chapter: ProjectChapter,
  offline: boolean,
): PublicationDependencyPlan[] {
  const dependencies: PublicationDependencyPlan[] = [];
  if (chapter.type === "video")
    dependencies.push(
      offline
        ? unsupported(
            `chapter:${chapter.id}:video`,
            { type: "chapter", id: chapter.id },
            chapter.originalUrl,
            "Offline publications do not support YouTube or Vimeo. Replace it with authored local media when that capability is available.",
          )
        : connected(
            `chapter:${chapter.id}:video`,
            { type: "chapter", id: chapter.id },
            chapter.originalUrl,
            null,
          ),
    );
  if (
    (chapter.type === "map" || chapter.type === "scrolly") &&
    chapter.camera.terrain?.enabled
  )
    dependencies.push(
      offline
        ? unsupported(
            `chapter:${chapter.id}:terrain`,
            { type: "chapter", id: chapter.id },
            "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp",
            "Remote terrain is not bounded for offline packaging. Disable terrain.",
          )
        : connected(
            `chapter:${chapter.id}:terrain`,
            { type: "chapter", id: chapter.id },
            "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp",
            null,
          ),
    );
  if (
    (chapter.type === "map" || chapter.type === "scrolly") &&
    chapter.camera.buildings
  )
    dependencies.push(
      offline
        ? unsupported(
            `chapter:${chapter.id}:buildings`,
            { type: "chapter", id: chapter.id },
            "https://tiles.openfreemap.org/planet",
            "Remote 3D buildings are not bounded for offline packaging. Disable buildings.",
          )
        : connected(
            `chapter:${chapter.id}:buildings`,
            { type: "chapter", id: chapter.id },
            "https://tiles.openfreemap.org/planet",
            null,
            true,
          ),
    );
  return dependencies;
}

export function inventoryPublicationDependencies(
  project: StoryProject,
  options: DependencyInventoryOptions = {},
): PublicationDependencyPlan[] {
  const digests = options.dependencyDigests ?? {};
  const offline = project.publication.profile === "offline";
  const dependencies: PublicationDependencyPlan[] = offline
    ? [
        included(
          "basemap:neutral:style",
          { type: "basemap", id: "neutral" },
          NEUTRAL_BASEMAP_STYLE_HREF,
          NEUTRAL_BASEMAP_STYLE_HREF,
          new TextEncoder().encode(NEUTRAL_BASEMAP_STYLE).byteLength,
          NEUTRAL_BASEMAP_STYLE_SHA256,
          false,
          "bundle-runtime",
        ),
      ]
    : [
        connected(
          `basemap:${project.basemap.id}:style`,
          { type: "basemap", id: project.basemap.id },
          project.basemap.styleUrl,
          null,
        ),
      ];

  for (const source of project.sources) {
    const id = `source:${source.id}:data`;
    const owner = { type: "source" as const, id: source.id };
    const locator = sourceLocator(source);
    const delivery = sourceDelivery(source, project.publication.profile);
    if (delivery === "included")
      dependencies.push(
        included(
          id,
          owner,
          includedLocator(source),
          locator,
          source.sizeBytes,
          digests[id],
          byteRangeKinds.has(source.kind),
        ),
      );
    else if (delivery === "connected")
      dependencies.push(
        connected(
          id,
          owner,
          locator,
          source.sizeBytes,
          byteRangeKinds.has(source.kind),
        ),
      );
    else
      dependencies.push(
        unsupported(
          id,
          owner,
          locator,
          source.kind === "xyz"
            ? "XYZ pyramids are unbounded. Use a bounded PMTiles source or the neutral basemap."
            : source.kind === "zarr"
              ? "Zarr stores are not yet bounded for offline packaging. Convert the data to a supported file source."
              : "Connected delivery is incompatible with an offline publication. Choose included delivery.",
          byteRangeKinds.has(source.kind)
            ? ["network", "cors", "byte-ranges"]
            : ["network", "cors"],
        ),
      );

    if (source.kind === "cog") {
      const projectionId = `source:${source.id}:projection`;
      dependencies.push(
        source.cog
          ? included(
              projectionId,
              owner,
              `projections/EPSG-${source.cog.epsg}.proj4`,
              source.cog.definition,
              new TextEncoder().encode(source.cog.definition).byteLength,
              digests[projectionId],
              false,
              "bundle-runtime",
            )
          : offline
            ? unsupported(
                projectionId,
                owner,
                "https://epsg.io/",
                "The COG needs an embedded projection definition before offline publication.",
              )
            : connected(projectionId, owner, "https://epsg.io/", null),
      );
    }
  }

  if (project.sources.some(({ kind }) => kind === "geoparquet"))
    for (const [name, sha256, estimatedBytes] of duckDbRuntime) {
      const locator = runtimeLocator(name);
      dependencies.push(
        included(
          `runtime:duckdb:${name}`,
          { type: "runtime", id: "duckdb" },
          locator,
          locator,
          estimatedBytes,
          sha256,
          false,
          "bundle-runtime",
        ),
      );
    }

  for (const chapter of project.chapters)
    dependencies.push(...chapterDependencies(chapter, offline));
  return dependencies;
}

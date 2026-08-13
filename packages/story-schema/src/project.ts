import { z } from "zod";

const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    );
  }, "Use an HTTP or HTTPS URL");

const isoDateOrDateTimeSchema = z.union([
  z.string().date(),
  z.string().datetime({ offset: true }),
]);

export const sourceProvenanceSchema = z.object({
  publisher: z.string().nullable().default(null),
  sourceUrl: httpUrlSchema.nullable().default(null),
  licenseName: z.string().nullable().default(null),
  licenseUrl: httpUrlSchema.nullable().default(null),
  dataUpdatedAt: isoDateOrDateTimeSchema.nullable().default(null),
  accessedAt: isoDateOrDateTimeSchema.nullable().default(null),
  staleAfterDays: z
    .number()
    .int()
    .nonnegative()
    .max(36_500)
    .nullable()
    .default(null),
  temporalCoverage: z
    .object({
      start: isoDateOrDateTimeSchema.nullable().default(null),
      end: isoDateOrDateTimeSchema.nullable().default(null),
    })
    .nullable()
    .default(null),
  spatialCoverage: z.string().nullable().default(null),
  transformations: z.array(z.string()).default(() => []),
});

export type SourceProvenance = z.infer<typeof sourceProvenanceSchema>;

export function createDefaultSourceProvenance(): SourceProvenance {
  return {
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
  };
}

export const defaultSourceProvenance = createDefaultSourceProvenance();

export const cameraSchema = z.object({
  center: z.tuple([z.number(), z.number()]),
  zoom: z.number(),
  bearing: z.number().default(0),
  pitch: z.number().default(0),
  terrain: z
    .object({ enabled: z.boolean(), exaggeration: z.number().min(0).max(10) })
    .optional(),
  globe: z.boolean().optional(),
  buildings: z.boolean().optional(),
});

export const LEGACY_DEFAULT_CAMERA: Camera = {
  center: [0, 20],
  zoom: 1.5,
  bearing: 0,
  pitch: 0,
};

export const flyoverKeyframeSchema = cameraSchema.extend({
  caption: z.string().default(""),
});

const sourceBaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  attribution: z.string().nullable().default(null),
  sizeBytes: z.number().int().nonnegative().nullable().default(null),
  delivery: z.enum(["auto", "included", "connected"]).default("auto"),
  provenance: sourceProvenanceSchema.default(createDefaultSourceProvenance),
  presentation: z
    .object({
      opacity: z.number().min(0).max(1).default(0.85),
      color: z
        .string()
        .regex(/^#[0-9a-f]{6}$/i)
        .default("#cf3f02"),
      strokeColor: z
        .string()
        .regex(/^#[0-9a-f]{6}$/i)
        .default("#443f3f"),
      radius: z.number().min(1).max(40).default(6),
      sourceLayer: z.string().nullable().default(null),
      rasterBand: z.number().int().positive().default(1),
      rescale: z.tuple([z.number(), z.number()]).nullable().default(null),
      colormap: z
        .enum(["viridis", "magma", "terrain", "grayscale"])
        .default("viridis"),
      legendTitle: z.string().default(""),
      legendVisible: z.boolean().default(true),
      symbolProperty: z.string().nullable().default(null),
      categoryColors: z
        .record(z.string(), z.string().regex(/^#[0-9a-f]{6}$/i))
        .default({}),
      filterProperty: z.string().nullable().default(null),
      filterValue: z.string().nullable().default(null),
    })
    .optional(),
});

export const projectSourceSchema = z.discriminatedUnion("kind", [
  sourceBaseSchema.extend({
    kind: z.literal("local-geojson"),
    path: z.string().min(1),
  }),
  sourceBaseSchema.extend({
    kind: z.literal("pmtiles"),
    locator: z.string().min(1),
    tileType: z.enum(["raster", "vector"]),
  }),
  sourceBaseSchema.extend({
    kind: z.literal("geoparquet"),
    locator: z.string().min(1),
  }),
  sourceBaseSchema.extend({
    kind: z.literal("image"),
    path: z.string().min(1),
  }),
  sourceBaseSchema.extend({
    kind: z.literal("csv"),
    path: z.string().min(1),
  }),
  sourceBaseSchema.extend({
    kind: z.literal("cog"),
    locator: z.string().min(1),
    cog: z
      .object({
        epsg: z.number().int().positive(),
        definition: z.string().min(1),
      })
      .nullable()
      .optional(),
  }),
  sourceBaseSchema.extend({
    kind: z.literal("xyz"),
    locator: z.string().min(1),
  }),
  sourceBaseSchema.extend({
    kind: z.literal("zarr"),
    locator: httpUrlSchema,
    variable: z.string().min(1),
    selection: z.record(z.string(), z.number().int().nonnegative()).default({}),
    timeDimension: z.string().nullable().default(null),
    timesteps: z
      .array(
        z.object({ label: z.string(), index: z.number().int().nonnegative() }),
      )
      .default([]),
    geozarr: z
      .object({
        dimensions: z.tuple([z.string(), z.string()]),
        transform: z.tuple([
          z.number(),
          z.number(),
          z.number(),
          z.number(),
          z.number(),
          z.number(),
        ]),
        shape: z.tuple([
          z.number().int().positive(),
          z.number().int().positive(),
        ]),
        crs: z.string().default("EPSG:4326"),
      })
      .nullable()
      .default(null),
  }),
  sourceBaseSchema.extend({
    kind: z.literal("trajectory"),
    locator: z.string().min(1),
    trailLength: z.number().positive().default(600),
  }),
  sourceBaseSchema.extend({
    kind: z.literal("copc"),
    locator: z.string().min(1),
    colorMode: z
      .enum(["elevation", "intensity", "classification", "rgb"])
      .default("elevation"),
    pointSize: z.number().min(1).max(10).default(2),
  }),
]);

export const projectDataAssetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  path: z.string().min(1),
  format: z.enum([
    "geotiff",
    "shapefile-zip",
    "geojson",
    "csv",
    "netcdf",
    "hdf5",
    "las",
    "laz",
    "gpx",
  ]),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  preparedSourceId: z.string().min(1).nullable().default(null),
});

const chapterBaseSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  narrative: z.string(),
});

export const projectChapterSchema = z.discriminatedUnion("type", [
  chapterBaseSchema.extend({ type: z.literal("prose") }),
  chapterBaseSchema.extend({
    type: z.literal("map"),
    camera: cameraSchema,
    sourceId: z.string().min(1),
    overlaySourceIds: z.array(z.string().min(1)).optional(),
    transition: z.enum(["fly-to", "instant"]).optional(),
    temporalPosition: z.number().min(0).max(1).optional(),
  }),
  chapterBaseSchema.extend({
    type: z.literal("scrolly"),
    camera: cameraSchema,
    sourceId: z.string().min(1),
    overlaySourceIds: z.array(z.string().min(1)).optional(),
    transition: z.enum(["fly-to", "instant"]).optional(),
    overlayPosition: z.enum(["left", "right"]).optional(),
    temporalPosition: z.number().min(0).max(1).optional(),
  }),
  chapterBaseSchema.extend({
    type: z.literal("image"),
    sourceId: z.string().min(1),
    alt: z.string(),
    caption: z.string().default(""),
  }),
  chapterBaseSchema.extend({
    type: z.literal("chart"),
    sourceId: z.string().min(1),
    chartType: z.enum(["bar", "line"]),
    xColumn: z.string().min(1),
    yColumn: z.string().min(1),
    yColumns: z.array(z.string().min(1)).optional(),
    seriesColumn: z.string().nullable().optional(),
    xLabel: z.string().optional(),
    yLabel: z.string().optional(),
    yScale: z.enum(["linear", "log"]).optional(),
    xMin: z.union([z.number(), z.string()]).nullable().optional(),
    xMax: z.union([z.number(), z.string()]).nullable().optional(),
  }),
  chapterBaseSchema.extend({
    type: z.literal("video"),
    provider: z.enum(["youtube", "vimeo"]),
    videoId: z.string().min(1),
    originalUrl: httpUrlSchema,
  }),
  chapterBaseSchema.extend({
    type: z.literal("flyover"),
    sourceId: z.string().min(1).nullable().default(null),
    overlaySourceIds: z.array(z.string().min(1)).default([]),
    keyframes: z.array(flyoverKeyframeSchema).min(2),
    scrollLength: z.number().min(0.5).max(5).default(1),
  }),
]);

const storyProjectFields = {
  id: z.string().min(1),
  metadata: z.object({
    title: z.string().min(1),
    description: z.string(),
    author: z.string().nullable().default(null),
    created: z.string().datetime(),
    updated: z.string().datetime(),
  }),
  basemap: z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    styleUrl: z.string().url(),
    attribution: z.string().nullable().default(null),
  }),
  sources: z.array(projectSourceSchema),
  dataAssets: z.array(projectDataAssetSchema).default([]),
  chapters: z.array(projectChapterSchema).min(1),
};

export const storyProjectV1Schema = z
  .object({
    schema: z.literal("earth-stories/project/v1"),
    ...storyProjectFields,
    publication: z
      .object({
        profile: z
          .enum(["connected", "portable", "custom"])
          .default("connected"),
        theme: z.enum(["cng", "editorial"]).default("cng"),
      })
      .default({ profile: "connected", theme: "cng" }),
  })
  .strict();

export const storyProjectV2Schema = z
  .object({
    schema: z.literal("earth-stories/project/v2"),
    ...storyProjectFields,
    publication: z
      .object({
        profile: z
          .enum(["connected", "portable", "custom", "offline"])
          .default("connected"),
        theme: z.enum(["cng", "editorial"]).default("cng"),
        offlineBasemap: z
          .object({ mode: z.literal("neutral") })
          .default({ mode: "neutral" }),
      })
      .default({
        profile: "connected",
        theme: "cng",
        offlineBasemap: { mode: "neutral" },
      }),
  })
  .strict();

function migrateStoryProjectV1(value: unknown): unknown {
  const legacy = storyProjectV1Schema.parse(value);
  return {
    ...legacy,
    schema: "earth-stories/project/v2" as const,
    publication: {
      ...legacy.publication,
      offlineBasemap: { mode: "neutral" as const },
    },
  };
}

/** Canonical persisted-project schema. V1 input is normalized to v2. */
export const storyProjectSchema = z.preprocess((value) => {
  if (
    value &&
    typeof value === "object" &&
    (value as { schema?: unknown }).schema === "earth-stories/project/v1"
  )
    return migrateStoryProjectV1(value);
  return value;
}, storyProjectV2Schema);

export class UnsupportedProjectSchemaError extends Error {
  constructor(schema: unknown) {
    super(
      `Unsupported Earth Stories project schema: ${typeof schema === "string" ? schema : "missing schema identifier"}`,
    );
    this.name = "UnsupportedProjectSchemaError";
  }
}

/**
 * Single entry point for reading persisted projects. Future schema versions
 * migrate here before validation so storage callers never silently lose a
 * project merely because its on-disk contract is older.
 */
export function parseStoryProject(value: unknown): StoryProject {
  if (!value || typeof value !== "object") {
    throw new UnsupportedProjectSchemaError(undefined);
  }
  const schema = (value as { schema?: unknown }).schema;
  switch (schema) {
    case "earth-stories/project/v1":
      return storyProjectV2Schema.parse(migrateStoryProjectV1(value));
    case "earth-stories/project/v2":
      return storyProjectV2Schema.parse(value);
    default:
      throw new UnsupportedProjectSchemaError(schema);
  }
}

export type Camera = z.infer<typeof cameraSchema>;
export type FlyoverKeyframe = z.infer<typeof flyoverKeyframeSchema>;
export type ProjectSource = z.infer<typeof projectSourceSchema>;
export type ProjectDataAsset = z.infer<typeof projectDataAssetSchema>;
export type ProjectChapter = z.infer<typeof projectChapterSchema>;
export type StoryProjectV1 = z.infer<typeof storyProjectV1Schema>;
export type StoryProject = z.infer<typeof storyProjectV2Schema>;

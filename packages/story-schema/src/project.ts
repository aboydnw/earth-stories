import { z } from "zod";

const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Use an HTTP or HTTPS URL");

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

const sourceBaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  attribution: z.string().nullable().default(null),
  sizeBytes: z.number().int().nonnegative().nullable().default(null),
  delivery: z.enum(["auto", "included", "connected"]).default("auto"),
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
  }),
  chapterBaseSchema.extend({
    type: z.literal("scrolly"),
    camera: cameraSchema,
    sourceId: z.string().min(1),
    overlaySourceIds: z.array(z.string().min(1)).optional(),
    transition: z.enum(["fly-to", "instant"]).optional(),
    overlayPosition: z.enum(["left", "right"]).optional(),
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
    keyframes: z.array(cameraSchema).min(2),
    scrollLength: z.number().min(0.5).max(5).default(1),
  }),
]);

export const storyProjectSchema = z
  .object({
    schema: z.literal("earth-stories/project/v1"),
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
    publication: z
      .object({
        profile: z
          .enum(["connected", "portable", "custom"])
          .default("connected"),
        theme: z.enum(["cng", "editorial"]).default("cng"),
      })
      .default({ profile: "connected", theme: "cng" }),
    sources: z.array(projectSourceSchema),
    dataAssets: z.array(projectDataAssetSchema).default([]),
    chapters: z.array(projectChapterSchema).min(1),
  })
  .strict();

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
      return storyProjectSchema.parse(value);
    default:
      throw new UnsupportedProjectSchemaError(schema);
  }
}

export type Camera = z.infer<typeof cameraSchema>;
export type ProjectSource = z.infer<typeof projectSourceSchema>;
export type ProjectDataAsset = z.infer<typeof projectDataAssetSchema>;
export type ProjectChapter = z.infer<typeof projectChapterSchema>;
export type StoryProject = z.infer<typeof storyProjectSchema>;

import { z } from "zod";
import { cameraSchema } from "./project.js";

const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Use an HTTP or HTTPS URL");

export const publicationAssetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum([
    "geojson",
    "pmtiles",
    "cog",
    "xyz",
    "geoparquet",
    "image",
    "csv",
    "zarr",
    "trajectory",
    "copc",
  ]),
  delivery: z.enum(["included", "connected"]),
  href: z.string().min(1),
  attribution: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  tileType: z.enum(["raster", "vector"]).nullable(),
  presentation: z.object({
    opacity: z.number().min(0).max(1),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    strokeColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    radius: z.number().min(1).max(40),
    sourceLayer: z.string().nullable(),
    rasterBand: z.number().int().positive(),
    rescale: z.tuple([z.number(), z.number()]).nullable(),
    colormap: z.enum(["viridis", "magma", "terrain", "grayscale"]),
    legendTitle: z.string(),
    legendVisible: z.boolean(),
    symbolProperty: z.string().nullable(),
    categoryColors: z.record(z.string(), z.string().regex(/^#[0-9a-f]{6}$/i)),
    filterProperty: z.string().nullable(),
    filterValue: z.string().nullable(),
  }),
  zarr: z
    .object({
      variable: z.string().min(1),
      selection: z.record(z.string(), z.number().int().nonnegative()),
      timeDimension: z.string().nullable(),
      timesteps: z.array(
        z.object({ label: z.string(), index: z.number().int().nonnegative() }),
      ),
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
          crs: z.string(),
        })
        .nullable(),
    })
    .nullable(),
  trajectory: z.object({ trailLength: z.number().positive() }).nullable(),
  copc: z
    .object({
      colorMode: z.enum(["elevation", "intensity", "classification", "rgb"]),
      pointSize: z.number().min(1).max(10),
    })
    .nullable(),
});

const publicationChapterBaseSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  narrative: z.string(),
});

export const publicationChapterSchema = z.discriminatedUnion("type", [
  publicationChapterBaseSchema.extend({ type: z.literal("prose") }),
  publicationChapterBaseSchema.extend({
    type: z.literal("map"),
    camera: cameraSchema,
    assetId: z.string().min(1),
    overlayAssetIds: z.array(z.string().min(1)),
    transition: z.enum(["fly-to", "instant"]),
  }),
  publicationChapterBaseSchema.extend({
    type: z.literal("scrolly"),
    camera: cameraSchema,
    assetId: z.string().min(1),
    overlayAssetIds: z.array(z.string().min(1)),
    transition: z.enum(["fly-to", "instant"]),
    overlayPosition: z.enum(["left", "right"]),
  }),
  publicationChapterBaseSchema.extend({
    type: z.literal("image"),
    assetId: z.string().min(1),
    alt: z.string(),
    caption: z.string(),
  }),
  publicationChapterBaseSchema.extend({
    type: z.literal("chart"),
    assetId: z.string().min(1),
    chartType: z.enum(["bar", "line"]),
    xColumn: z.string().min(1),
    yColumn: z.string().min(1),
    yColumns: z.array(z.string().min(1)),
    seriesColumn: z.string().nullable(),
    xLabel: z.string(),
    yLabel: z.string(),
    yScale: z.enum(["linear", "log"]),
    xMin: z.union([z.number(), z.string()]).nullable(),
    xMax: z.union([z.number(), z.string()]).nullable(),
  }),
  publicationChapterBaseSchema.extend({
    type: z.literal("video"),
    provider: z.enum(["youtube", "vimeo"]),
    videoId: z.string().min(1),
    originalUrl: httpUrlSchema,
  }),
  publicationChapterBaseSchema.extend({
    type: z.literal("flyover"),
    assetId: z.string().min(1).nullable(),
    overlayAssetIds: z.array(z.string().min(1)),
    keyframes: z.array(cameraSchema).min(2),
    scrollLength: z.number().min(0.5).max(5),
  }),
]);

export const publicationManifestSchema = z.object({
  schema: z.literal("earth-stories/publication/v1"),
  build: z.object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    projectDigest: z.string().regex(/^[a-f0-9]{64}$/),
    runtimeVersion: z.string().min(1),
  }),
  metadata: z.object({
    title: z.string().min(1),
    description: z.string(),
    author: z.string().nullable(),
  }),
  publication: z.object({
    profile: z.enum(["connected", "portable", "custom"]),
    theme: z.enum(["cng", "editorial"]),
  }),
  basemap: z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    styleUrl: z.string().url(),
    attribution: z.string().nullable(),
  }),
  assets: z.array(publicationAssetSchema),
  chapters: z.array(publicationChapterSchema).min(1),
  externalDependencies: z.array(
    z.object({
      resourceId: z.string().min(1),
      href: z.string().min(1),
      requirements: z.array(z.enum(["network", "cors", "byte-ranges"])),
    }),
  ),
  hostingRequirements: z.array(z.enum(["static-http", "cors", "byte-ranges"])),
});

export type PublicationAsset = z.infer<typeof publicationAssetSchema>;
export type PublicationChapter = z.infer<typeof publicationChapterSchema>;
export type PublicationManifest = z.infer<typeof publicationManifestSchema>;

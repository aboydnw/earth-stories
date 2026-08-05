import { z } from "zod";

export const cameraSchema = z.object({
  center: z.tuple([z.number(), z.number()]),
  zoom: z.number(),
  bearing: z.number().default(0),
  pitch: z.number().default(0),
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
]);

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
  }),
  chapterBaseSchema.extend({
    type: z.literal("scrolly"),
    camera: cameraSchema,
    sourceId: z.string().min(1),
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
    chapters: z.array(projectChapterSchema).min(1),
  })
  .strict();

export type Camera = z.infer<typeof cameraSchema>;
export type ProjectSource = z.infer<typeof projectSourceSchema>;
export type ProjectChapter = z.infer<typeof projectChapterSchema>;
export type StoryProject = z.infer<typeof storyProjectSchema>;

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
    kind: z.literal("cog"),
    locator: z.string().url(),
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
]);

export const storyProjectSchema = z
  .object({
    schema: z.literal("devseed-stories/project/v1"),
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
    chapters: z.array(projectChapterSchema).min(1),
  })
  .strict();

export type Camera = z.infer<typeof cameraSchema>;
export type ProjectSource = z.infer<typeof projectSourceSchema>;
export type ProjectChapter = z.infer<typeof projectChapterSchema>;
export type StoryProject = z.infer<typeof storyProjectSchema>;

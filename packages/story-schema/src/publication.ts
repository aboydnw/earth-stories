import { z } from "zod";
import { cameraSchema } from "./project.js";

export const publicationAssetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["geojson", "pmtiles", "cog", "xyz"]),
  delivery: z.enum(["included", "connected"]),
  href: z.string().min(1),
  attribution: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
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
  }),
]);

export const publicationManifestSchema = z.object({
  schema: z.literal("devseed-stories/publication/v1"),
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
});

export type PublicationAsset = z.infer<typeof publicationAssetSchema>;
export type PublicationChapter = z.infer<typeof publicationChapterSchema>;
export type PublicationManifest = z.infer<typeof publicationManifestSchema>;

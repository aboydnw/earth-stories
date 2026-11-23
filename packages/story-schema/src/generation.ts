import { visualAccentsSchema } from "./visualAccents.js";
import { visualSequencesSchema } from "./visualSequences.js";
import { z } from "zod";
import { readerPaletteSchema, sceneSchema } from "./illustration.js";
import { type StoryProject, storyProjectV3Schema } from "./project.js";
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
const classification = z.enum(["facts", "visual-style", "background"]);
export const referenceInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("text"),
      name: z.string().max(200),
      classification,
      text: z.string().max(200000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("url"),
      name: z.string().max(200),
      classification,
      url: z.string().url().max(2048),
      notes: z.string().max(4000).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("upload"),
      name: z.string().max(200),
      classification,
      mediaType: z.enum([
        "text/plain",
        "text/markdown",
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/webp",
      ]),
      data: z.string().max(28 * 1024 * 1024),
    })
    .strict(),
]);
export const storyBriefSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    model: z.string().min(1).max(200).optional(),
    audience: z.string().max(2000),
    takeaway: z.string().max(4000),
    narrative: z.string().max(50000),
    visualDirection: z.string().max(60002),
    visualTreatment: z.enum(["focused", "whole-story"]).optional(),
    references: z.array(referenceInputSchema).max(20),
    requestedOutputs: z
      .array(z.enum(["illustration", "animation", "prose"]))
      .min(1)
      .max(3),
  })
  .strict();
export const illustrationRequestSchema = z
  .object({
    id,
    prompt: z.string().min(1).max(12000),
    referenceIds: z.array(id).max(4),
    width: z.literal(1024),
    height: z.literal(1024),
  })
  .strict();
export const enhancementTextEditSchema = z
  .object({
    chapterId: z.string().min(1),
    before: z.string().min(1).max(240),
    after: z.string().min(1).max(360),
    reason: z.string().min(1).max(500),
    visualChapterId: id,
  })
  .strict();
export const storyPlanSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000),
    palette: readerPaletteSchema.required(),
    chapters: z
      .array(
        z
          .object({
            id,
            type: z.enum(["prose", "illustrated"]),
            title: z.string().min(1).max(200),
            narrative: z.string().max(20000),
            alt: z.string().max(2000),
            caption: z.string().max(2000),
            scene: sceneSchema.nullable(),
            afterChapterId: z.string().min(1).nullable().optional(),
          })
          .strict(),
      )
      .max(30),
    visualSequences: visualSequencesSchema.optional(),
    visualAccents: visualAccentsSchema.optional(),
    textEdits: z.array(enhancementTextEditSchema).max(8).optional(),
    artwork: z.array(illustrationRequestSchema).max(24),
    warnings: z.array(z.string().max(2000)).max(30),
  })
  .strict()
  .superRefine((plan, ctx) => {
    if (
      !plan.chapters.length &&
      !plan.visualSequences?.length &&
      !plan.visualAccents?.length
    )
      ctx.addIssue({
        code: "custom",
        message: "A plan must contain chapters or visual sequences",
      });
    if (
      new Set(plan.chapters.map((c) => c.id)).size !== plan.chapters.length ||
      new Set(plan.artwork.map((a) => a.id)).size !== plan.artwork.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Chapter and artwork IDs must be unique",
      });
    if (plan.chapters.filter((c) => c.type === "illustrated").length > 12)
      ctx.addIssue({
        code: "custom",
        message: "At most 12 illustrated scenes are allowed",
      });
    const images = new Set(plan.artwork.map((a) => a.id));
    for (const chapter of plan.chapters) {
      if ((chapter.type === "illustrated") !== Boolean(chapter.scene))
        ctx.addIssue({
          code: "custom",
          message: "Only illustrated chapters must have a scene",
        });
      for (const layer of chapter.scene?.layers ?? [])
        if (layer.kind === "image" && !images.has(layer.sourceId))
          ctx.addIssue({
            code: "custom",
            message: "Scene references unknown artwork",
          });
    }
  });
function providerSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(providerSchema);
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "default" || key === "$schema") continue;
    if (key === "const") output.enum = [item];
    else output[key] = providerSchema(item);
  }
  return output;
}
export const storyPlanJsonSchema = providerSchema(
  z.toJSONSchema(storyPlanSchema, { target: "draft-7" }),
);
export const generationStageSchema = z.enum([
  "queued",
  "planning",
  "illustrating",
  "assembling",
  "validating",
  "ready",
  "failed",
  "cancelled",
  "accepted",
]);
export const generatedAssetSchema = z
  .object({
    id,
    path: z.string().regex(/^assets\/[a-f0-9]{64}\.png$/),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z
      .number()
      .int()
      .min(1)
      .max(20 * 1024 * 1024),
    mediaType: z.literal("image/png"),
    model: z.string(),
    prompt: z.string(),
  })
  .strict();
export const generationCandidateSchema = z
  .object({
    project: storyProjectV3Schema,
    assets: z.array(generatedAssetSchema).max(24),
    warnings: z.array(z.string()),
    digest: z.string(),
  })
  .strict();
export const generationJobSchema = z
  .object({
    id,
    stage: generationStageSchema,
    brief: storyBriefSchema,
    enhancement: z
      .object({
        projectId: z.string().min(1),
        sourceDigest: z.string(),
        warnings: z.array(z.string()),
      })
      .strict()
      .optional(),
    referenceStorage: z.literal("separate").optional(),
    referenceMetadata: z
      .array(
        z
          .object({
            kind: z.enum(["text", "url", "upload"]),
            name: z.string().max(200),
            classification,
            mediaType: z.string().optional(),
            url: z.string().url().optional(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    plan: storyPlanSchema.nullable(),
    assets: z.array(generatedAssetSchema),
    candidate: generationCandidateSchema.nullable(),
    error: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    usage: z.array(z.record(z.string(), z.unknown())),
    acceptance: z
      .object({ projectId: id, candidateDigest: z.string() })
      .nullable(),
  })
  .strict();
export type StoryBrief = z.infer<typeof storyBriefSchema>;
export type ReferenceInput = z.infer<typeof referenceInputSchema>;
export type StoryPlan = z.infer<typeof storyPlanSchema>;
export type IllustrationRequest = z.infer<typeof illustrationRequestSchema>;
export type GenerationJob = z.infer<typeof generationJobSchema>;
export type GenerationCandidate = z.infer<typeof generationCandidateSchema>;
export type GeneratedAsset = z.infer<typeof generatedAssetSchema>;
export type PreparedReference = {
  id: string;
  name: string;
  classification: ReferenceInput["classification"];
  text?: string;
  image?: string;
  notes?: string;
  sourceUrl?: string;
  requestedUrl?: string;
  warnings?: string[];
};
export interface GenerationProvider {
  configured: boolean;
  plan(
    brief: StoryBrief,
    references: PreparedReference[],
    signal: AbortSignal,
    source?: StoryProject,
  ): Promise<{ plan: StoryPlan; usage: Record<string, unknown> }>;
}

export function generationPlanIssues(
  plan: StoryPlan,
  brief: StoryBrief,
): string[] {
  const scenes = [
    ...plan.chapters.flatMap((chapter) =>
      chapter.scene ? [chapter.scene] : [],
    ),
    ...(plan.visualSequences ?? []).map((s) => s.scene),
    ...(plan.visualAccents ?? []).map((s) => s.scene),
  ];
  const images = new Set(
    scenes.flatMap((scene) =>
      scene.layers.flatMap((layer) =>
        layer.kind === "image" ? [layer.sourceId] : [],
      ),
    ),
  );
  const issues: string[] = [];
  if (
    brief.requestedOutputs.includes("illustration") &&
    !scenes.some((scene) =>
      scene.layers.some(
        (layer) => layer.kind === "path" || layer.kind === "image",
      ),
    )
  )
    issues.push(
      "The brief requested an illustration, but no scene contains visual layers.",
    );
  if (
    brief.requestedOutputs.includes("animation") &&
    !scenes.some(
      (scene) =>
        scene.motionStrength > 0 &&
        scene.layers.some(
          (layer) =>
            layer.keyframes.length > 1 &&
            layer.keyframes.some(
              (frame) =>
                JSON.stringify({ ...frame, at: 0 }) !==
                JSON.stringify({ ...layer.keyframes[0], at: 0 }),
            ),
        ),
    )
  )
    issues.push(
      "The brief requested scroll animation, but all scenes are static.",
    );
  if (plan.artwork.some((art) => !images.has(art.id)))
    issues.push("Artwork must be used by a scene.");
  return issues;
}

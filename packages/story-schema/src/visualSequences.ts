import { z } from "zod";
import { sceneSchema } from "./illustration.js";

export const VISUAL_PROGRESS_EPSILON = 1e-6;

/** Vector-only sequences carry no source authority or executable markup. */
export const vectorSceneSchema = sceneSchema
  .extend({
    layers: z
      .array(
        z.discriminatedUnion("kind", [
          sceneSchema.shape.layers.element.options[0]!,
          sceneSchema.shape.layers.element.options[1]!,
        ]),
      )
      .min(1)
      .max(64),
  })
  .superRefine((scene, ctx) => {
    for (const [index, layer] of scene.layers.entries()) {
      if (
        layer.keyframes.length &&
        (layer.keyframes.length < 2 ||
          layer.keyframes[0]!.at !== 0 ||
          layer.keyframes.at(-1)!.at !== 1)
      )
        ctx.addIssue({
          code: "custom",
          path: ["layers", index, "keyframes"],
          message: "Animated vector layers must include progress 0 and 1",
        });
    }
    if (new Set(scene.layers.map((l) => l.id)).size !== scene.layers.length)
      ctx.addIssue({
        code: "custom",
        path: ["layers"],
        message: "Layer IDs must be unique",
      });
    if (
      scene.layers.reduce(
        (n, l) => n + (l.kind === "path" ? l.pathData.length : l.text.length),
        0,
      ) > 150000
    )
      ctx.addIssue({
        code: "custom",
        path: ["layers"],
        message: "Scene geometry exceeds 150,000 characters",
      });
  });
export const visualSequenceSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/),
    alt: z.string().min(1).max(2000),
    caption: z.string().max(2000),
    scene: vectorSceneSchema,
    steps: z
      .array(
        z
          .object({
            chapterId: z.string().min(1),
            start: z.number().min(0).max(1),
            end: z.number().min(0).max(1),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()
  .superRefine((sequence, ctx) => {
    if (!sequence.steps.length) return;
    if (
      sequence.steps[0]!.start !== 0 ||
      sequence.steps.at(-1)!.end !== 1 ||
      sequence.steps.some(
        (s, i) =>
          s.end <= s.start ||
          (i > 0 &&
            Math.abs(s.start - sequence.steps[i - 1]!.end) >
              VISUAL_PROGRESS_EPSILON),
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["steps"],
        message: "Sequence steps must continuously cover progress 0 to 1",
      });
  });
export type VisualSequence = z.infer<typeof visualSequenceSchema>;
export const MAX_VISUAL_SEQUENCES = 12;
export const visualSequencesSchema = z
  .array(visualSequenceSchema)
  .max(MAX_VISUAL_SEQUENCES)
  .refine(
    (v) => JSON.stringify(v).length <= 600000,
    "Visual sequences exceed 600,000 characters",
  );
export function isVisualSequenceChapter(type: string): boolean {
  return type === "prose" || type === "illustrated";
}
export function validateVisualSequences(
  chapters: { id: string; type: string }[],
  sequences: VisualSequence[] = [],
): string[] {
  const errors: string[] = [],
    used = new Set<string>(),
    ids = new Set<string>();
  for (const sequence of sequences) {
    if (ids.has(sequence.id))
      errors.push(`Duplicate sequence ID: ${sequence.id}`);
    ids.add(sequence.id);
    let previous = -1;
    for (const [i, step] of sequence.steps.entries()) {
      const index = chapters.findIndex((c) => c.id === step.chapterId),
        chapter = chapters[index];
      if (
        !chapter ||
        !isVisualSequenceChapter(chapter.type) ||
        (i > 0 && index !== previous + 1) ||
        used.has(step.chapterId)
      )
        errors.push(
          `Sequence ${sequence.id}: ${step.chapterId} must be a unique, consecutive prose or illustrated chapter`,
        );
      used.add(step.chapterId);
      previous = index;
    }
  }
  return errors;
}

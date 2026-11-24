import { z } from "zod";

import {
  publicationIllustrationSceneSchema,
  illustrationSceneSchema,
  type VisualSequence,
} from "./visualSequences.js";
export const visualAccentSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/),
    chapterId: z.string().min(1),
    placement: z.enum(["leading", "trailing", "margin"]),
    alt: z.string().trim().min(1).max(2000),
    scene: illustrationSceneSchema,
  })
  .strict();
export const publicationVisualAccentSchema = visualAccentSchema.extend({
  scene: publicationIllustrationSceneSchema,
});
export const publicationVisualAccentsSchema = z
  .array(publicationVisualAccentSchema)
  .max(12);
export type PublicationVisualAccent = z.infer<
  typeof publicationVisualAccentSchema
>;
export type VisualAccent = z.infer<typeof visualAccentSchema>;
export const MAX_VISUAL_ACCENTS = 12;
export const visualAccentsSchema = z
  .array(visualAccentSchema)
  .max(MAX_VISUAL_ACCENTS);
export function validateVisualAccents(
  chapters: { id: string }[],
  accents: Pick<VisualAccent, "id" | "chapterId">[] = [],
  sequences: Pick<VisualSequence, "id" | "steps">[] = [],
): string[] {
  const errors: string[] = [],
    ids = new Set(sequences.map((s) => s.id)),
    targets = new Set<string>();
  const covered = new Set(
    sequences.flatMap((s) => s.steps.map((s) => s.chapterId)),
  );
  for (const accent of accents) {
    if (ids.has(accent.id)) errors.push(`Duplicate visual ID: ${accent.id}`);
    if (targets.has(accent.chapterId))
      errors.push(
        `Only one companion artwork is allowed on ${accent.chapterId}`,
      );
    if (!chapters.some((c) => c.id === accent.chapterId))
      errors.push(`Unknown artwork chapter: ${accent.chapterId}`);
    if (covered.has(accent.chapterId))
      errors.push(
        `Companion artwork cannot overlap the visual sequence on ${accent.chapterId}`,
      );
    ids.add(accent.id);
    targets.add(accent.chapterId);
  }
  if (
    accents.length &&
    JSON.stringify([...sequences, ...accents]).length > 600000
  )
    errors.push(
      "Combined visual sequences and accents exceed 600,000 characters",
    );
  return errors;
}
/** Only chapter deletion removes companion art; overlaps remain validation errors. */
export function reconcileVisualAccents(
  chapters: { id: string }[],
  accents: VisualAccent[],
): VisualAccent[] {
  return accents.filter((a) => chapters.some((c) => c.id === a.chapterId));
}

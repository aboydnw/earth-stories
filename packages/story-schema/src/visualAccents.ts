import { z } from "zod";
import { vectorSceneSchema, type VisualSequence } from "./visualSequences.js";
export const visualAccentSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/),
    chapterId: z.string().min(1),
    placement: z.enum(["leading", "trailing", "margin"]),
    alt: z.string().trim().min(1).max(2000),
    scene: vectorSceneSchema,
  })
  .strict();
export type VisualAccent = z.infer<typeof visualAccentSchema>;
export const visualAccentsSchema = z.array(visualAccentSchema).max(12);
export function validateVisualAccents(
  chapters: { id: string }[],
  accents: VisualAccent[] = [],
  sequences: VisualSequence[] = [],
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
/** Chapter removal or sequence edits must not strand companion art. */
export function reconcileVisualAccents(
  chapters: { id: string }[],
  accents: VisualAccent[],
  sequences: VisualSequence[] = [],
): VisualAccent[] {
  const covered = new Set(
    sequences.flatMap((s) => s.steps.map((s) => s.chapterId)),
  );
  return accents.filter(
    (a) =>
      chapters.some((c) => c.id === a.chapterId) && !covered.has(a.chapterId),
  );
}

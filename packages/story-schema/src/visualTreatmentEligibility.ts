import type { StoryProject } from "./project.js";
import { MAX_VISUAL_ACCENTS } from "./visualAccents.js";
import {
  isVisualSequenceChapter,
  MAX_VISUAL_SEQUENCES,
} from "./visualSequences.js";

const creditTitle =
  /^(?:credits|acknowledg(?:e)?ments|methodology|references|sources(?: and credits)?|how (?:this|the) story was (?:built|made))$/i;
const creditId =
  /^(?:credits|acknowledg(?:e)?ments|methodology|references|sources)$/i;

export function visualTreatmentNarrative(
  source: Pick<StoryProject, "chapters">,
) {
  return source.chapters.filter(
    (chapter) =>
      !creditTitle.test(chapter.title.trim()) && !creditId.test(chapter.id),
  );
}

/** Reject known impossible placements without predicting model output quality. */
export function wholeStoryVisualTreatmentIssue(
  source: Pick<StoryProject, "chapters" | "visualSequences" | "visualAccents">,
): string | null {
  const focused = "Choose Focused artwork instead of Whole story.";
  const narrative = visualTreatmentNarrative(source);
  if (narrative.length < 3)
    return `Whole story needs at least three chapters outside credits. ${focused}`;

  const sequences = source.visualSequences ?? [];
  const accents = source.visualAccents ?? [];
  if (
    sequences.length >= MAX_VISUAL_SEQUENCES ||
    accents.length >= MAX_VISUAL_ACCENTS
  )
    return `This story has reached its limit for visual sequences or companion artwork. ${focused}`;

  const occupied = new Set([
    ...sequences.flatMap((sequence) => sequence.steps.map((s) => s.chapterId)),
    ...accents.map((accent) => accent.chapterId),
  ]);
  const available = narrative.filter((chapter) => !occupied.has(chapter.id));
  if (!available.some((chapter) => isVisualSequenceChapter(chapter.type)))
    return `Whole story needs a prose or illustrated chapter that does not already have a visual sequence or companion artwork. ${focused}`;
  if (available.length < 2)
    return `Whole story needs separate available chapters for an immersive sequence and companion artwork. ${focused}`;
  return null;
}

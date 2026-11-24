import {
  visualTreatmentNarrative,
  wholeStoryVisualTreatmentIssue,
  type StoryPlan,
  type StoryProject,
} from "@earth-stories/story-schema";
/** Count real placements, not a model's description of what it claims to have added. */
export function inspectVisualTreatment(
  plan: StoryPlan,
  source: StoryProject,
): string[] {
  const issue = wholeStoryVisualTreatmentIssue(source);
  if (issue) return [issue];
  const narrative = visualTreatmentNarrative(source);
  const positions = new Map(narrative.map((c, i) => [c.id, i]));
  const hasArt = (scene: { layers: { kind: string }[] } | null | undefined) =>
    scene?.layers.some((l) => l.kind === "path" || l.kind === "image");
  const immersive = (plan.visualSequences ?? [])
    .filter((s) => hasArt(s.scene))
    .flatMap((s) =>
      s.steps.flatMap((step) =>
        positions.has(step.chapterId) ? [positions.get(step.chapterId)!] : [],
      ),
    );
  const transitions = plan.chapters
    .filter((c) => c.type === "illustrated" && hasArt(c.scene))
    .flatMap((c) =>
      c.afterChapterId === null
        ? [0]
        : positions.has(c.afterChapterId ?? "")
          ? [positions.get(c.afterChapterId!)!]
          : [],
    );
  const companions = (plan.visualAccents ?? [])
    .filter((a) => hasArt(a.scene))
    .flatMap((a) =>
      positions.has(a.chapterId) ? [positions.get(a.chapterId)!] : [],
    );
  const issues: string[] = [];
  for (const chapter of plan.chapters) {
    const index = source.chapters.findIndex(
      (item) => item.id === chapter.afterChapterId,
    );
    if (
      index >= 0 &&
      source.chapters[index]?.type === "scrolly" &&
      source.chapters[index + 1]?.type === "scrolly"
    )
      issues.push(
        `Move the transition after ${chapter.afterChapterId} outside the continuous map group; use companion art alongside its narrative instead.`,
      );
  }
  if (!immersive.length)
    issues.push(
      "Include an immersive visual sequence using original narrative chapters.",
    );
  if (!transitions.length)
    issues.push(
      "Include a purposeful illustrated transition beside an original narrative chapter.",
    );
  if (!companions.length)
    issues.push(
      "Include companion artwork on existing story content beyond credits.",
    );
  const placements = [...immersive, ...transitions, ...companions];
  // Bucket chapter centers into thirds so short stories still have a middle
  // (four chapters occupy beginning, middle, middle, and later).
  const bands = new Set(
    placements.map((position) =>
      Math.min(2, Math.floor(((position + 0.5) * 3) / narrative.length)),
    ),
  );
  if (bands.size < 3)
    issues.push(
      "Distribute artwork through the beginning, middle and later narrative. Opening-only or credits-only decoration does not satisfy Whole story.",
    );
  return issues;
}

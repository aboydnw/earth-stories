import type {
  SceneDefinition,
  StoryProject,
} from "@earth-stories/story-schema";
/** Count each narrative chapter once, including the artwork that accompanies it. */
export function sourceChapterIds(
  project: Pick<StoryProject, "chapters" | "visualSequences" | "visualAccents">,
  sourceId: string,
): string[] {
  const uses = (scene: SceneDefinition) =>
    scene.layers.some((l) => l.kind === "image" && l.sourceId === sourceId);
  const chapters = new Set(
    project.chapters
      .filter(
        (c) =>
          (c.type === "illustrated" && uses(c.scene)) ||
          ("sourceId" in c && c.sourceId === sourceId) ||
          ("overlaySourceIds" in c && c.overlaySourceIds?.includes(sourceId)),
      )
      .map((c) => c.id),
  );
  for (const sequence of project.visualSequences ?? [])
    if (uses(sequence.scene))
      for (const step of sequence.steps) chapters.add(step.chapterId);
  for (const accent of project.visualAccents ?? [])
    if (uses(accent.scene)) chapters.add(accent.chapterId);
  return [...chapters];
}

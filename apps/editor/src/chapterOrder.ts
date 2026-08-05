import type { ProjectChapter } from "@earth-stories/story-schema";

export function reorderChapters(
  chapters: ProjectChapter[],
  chapterId: string,
  offset: number,
): ProjectChapter[] {
  const from = chapters.findIndex((chapter) => chapter.id === chapterId);
  if (from < 0 || chapters.length < 2) return chapters;

  const to = Math.max(0, Math.min(chapters.length - 1, from + offset));
  if (from === to) return chapters;

  const next = [...chapters];
  const chapter = next[from];
  if (!chapter) return chapters;
  next.splice(from, 1);
  next.splice(to, 0, chapter);
  return next;
}

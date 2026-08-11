import type { ProjectChapter } from "@earth-stories/story-schema";

export function referencedSourceIds(chapter: ProjectChapter): string[] {
  if (chapter.type === "prose" || chapter.type === "video") return [];
  return [
    ...(chapter.sourceId ? [chapter.sourceId] : []),
    ...("overlaySourceIds" in chapter ? (chapter.overlaySourceIds ?? []) : []),
  ];
}

import type { ProjectChapter } from "@earth-stories/story-schema";

export function referencedSourceIds(chapter: ProjectChapter): string[] {
  if (chapter.type === "illustrated")
    return [
      ...new Set(
        chapter.scene.layers.flatMap((layer) =>
          layer.kind === "image" ? [layer.sourceId] : [],
        ),
      ),
    ];
  if (chapter.type === "prose" || chapter.type === "video") return [];
  return [
    ...(chapter.sourceId ? [chapter.sourceId] : []),
    ...("overlaySourceIds" in chapter ? (chapter.overlaySourceIds ?? []) : []),
  ];
}

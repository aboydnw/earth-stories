import type {
  PublicationManifest,
  ProjectChapter,
  StoryProject,
} from "@earth-stories/story-schema";
import { compileProject } from "./compile.js";

export type FocusedPreviewResult =
  | { status: "ready"; manifest: PublicationManifest }
  | {
      status: "error";
      code: "missing-chapter" | "compile-failed";
      message: string;
    };

function referencedSourceIds(chapter: ProjectChapter) {
  if (chapter.type === "prose" || chapter.type === "video")
    return new Set<string>();
  return new Set([
    ...(chapter.sourceId ? [chapter.sourceId] : []),
    ...("overlaySourceIds" in chapter ? (chapter.overlaySourceIds ?? []) : []),
  ]);
}

export function compileFocusedChapter(
  project: StoryProject,
  chapterId: string,
): FocusedPreviewResult {
  const chapter = project.chapters.find(({ id }) => id === chapterId);
  if (!chapter)
    return {
      status: "error",
      code: "missing-chapter",
      message: "The selected chapter is no longer available.",
    };

  const sourceIds = referencedSourceIds(chapter);
  const focusedProject: StoryProject = {
    ...project,
    chapters: [structuredClone(chapter)],
    sources: project.sources
      .filter(({ id }) => sourceIds.has(id))
      .map((source) => structuredClone(source)),
  };

  try {
    return { status: "ready", manifest: compileProject(focusedProject) };
  } catch (cause) {
    return {
      status: "error",
      code: "compile-failed",
      message:
        cause instanceof Error
          ? cause.message
          : "The selected chapter could not be compiled.",
    };
  }
}

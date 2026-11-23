import {
  defaultScene,
  projectChapterSchema,
  storyProjectSchema,
  type ProjectChapter,
  type ProjectSource,
  type StoryProject,
} from "@earth-stories/story-schema";
import { motionLayer } from "./illustrationLayerEditing";
export type ArtworkChapter = Extract<ProjectChapter, { type: "illustrated" }>;
export function artworkChapter(
  id: string,
  title: string,
  dimensions: { width: number; height: number },
  layers: { id: string; name: string }[],
): ArtworkChapter {
  const ratio = Math.min(
    1,
    4096 / Math.max(dimensions.width, dimensions.height),
  );
  const chapter = projectChapterSchema.parse({
    id,
    type: "illustrated",
    title,
    narrative: "",
    alt: title,
    caption: "",
    scene: {
      ...defaultScene(),
      width: Math.max(100, Math.round(dimensions.width * ratio)),
      height: Math.max(100, Math.round(dimensions.height * ratio)),
      staticProgress: 0.5,
      layers: layers.map((l) => ({
        id: l.id,
        kind: "image",
        sourceId: l.id,
        alt: l.name,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        opacity: 1,
        keyframes: [],
      })),
    },
  });
  if (chapter.type !== "illustrated") throw new Error("Invalid illustration.");
  if (chapter.scene.layers.length === 1)
    chapter.scene.layers = chapter.scene.layers.map((l) =>
      motionLayer(l, "closer"),
    );
  return chapter;
}
export function artworkAnchors(project: StoryProject): ProjectChapter[] {
  const protectedIds = new Set(
    (project.visualSequences ?? []).flatMap((s) =>
      s.steps.slice(0, -1).map((step) => step.chapterId),
    ),
  );
  return project.chapters.filter((c) => !protectedIds.has(c.id));
}
export function insertArtworkChapter(
  project: StoryProject,
  chapter: ArtworkChapter,
  sources: ProjectSource[],
  afterId: string | null,
): StoryProject {
  if (
    afterId !== null &&
    !artworkAnchors(project).some((c) => c.id === afterId)
  )
    throw new Error("Choose a chapter outside an existing visual sequence.");
  if (
    project.chapters.some((c) => c.id === chapter.id) ||
    sources.some((s) => project.sources.some((old) => old.id === s.id))
  )
    throw new Error("This illustration has already been added to the story.");
  const index =
    afterId === null
      ? 0
      : project.chapters.findIndex((c) => c.id === afterId) + 1;
  return storyProjectSchema.parse({
    ...project,
    sources: [...project.sources, ...sources],
    chapters: [
      ...project.chapters.slice(0, index),
      chapter,
      ...project.chapters.slice(index),
    ],
  });
}

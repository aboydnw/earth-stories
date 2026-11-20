import { compileProject } from "@earth-stories/publisher/compile";
import {
  storyProjectSchema,
  type GenerationCandidate,
  type GenerationJob,
  type StoryProject,
} from "@earth-stories/story-schema";
import { digestBytes } from "./candidate.js";

/** Only explicitly supported changes are applied; all other authored fields survive. */
export function assembleEnhancement(
  job: Pick<GenerationJob, "plan" | "assets" | "enhancement">,
  source: StoryProject,
): GenerationCandidate {
  const plan = job.plan;
  if (!plan || plan.artwork.length || job.assets.length)
    throw new Error("Enhancements require vector scenes only.");
  const existing = new Set(source.chapters.map((c) => c.id));
  const additions = new Set<string>();
  for (const chapter of plan.chapters) {
    if (existing.has(chapter.id) || additions.has(chapter.id))
      throw new Error("Visual chapter IDs must be new and unique.");
    additions.add(chapter.id);
    if (
      chapter.type !== "illustrated" ||
      !chapter.scene ||
      chapter.scene.layers.some((l) => l.kind === "image")
    )
      throw new Error(
        "Enhancements may only add vector illustration chapters.",
      );
    if (
      chapter.afterChapterId === undefined ||
      (chapter.afterChapterId !== null && !existing.has(chapter.afterChapterId))
    )
      throw new Error("Each visual must be placed beside an existing chapter.");
  }
  const project = structuredClone(source);
  const edited = new Set<string>();
  let changed = 0;
  for (const edit of plan.textEdits ?? []) {
    const chapter = project.chapters.find((c) => c.id === edit.chapterId);
    if (
      !chapter ||
      edited.has(edit.chapterId) ||
      !additions.has(edit.visualChapterId)
    )
      throw new Error(
        "Text edits must identify an existing chapter and a new supporting visual.",
      );
    const pieces = chapter.narrative.split(edit.before);
    if (pieces.length !== 2)
      throw new Error(
        "A text edit must match exactly one passage in the original chapter.",
      );
    changed += Math.max(edit.before.length, edit.after.length);
    if (changed > 600)
      throw new Error("Text changes are too large for visual enhancement.");
    chapter.narrative = pieces.join(edit.after);
    edited.add(chapter.id);
  }
  const inserted = (anchor: string | null) =>
    plan.chapters
      .filter((c) => c.afterChapterId === anchor)
      .map(({ afterChapterId: _anchor, ...c }) => c);
  project.chapters = [
    ...inserted(null),
    ...project.chapters.flatMap((c) => [c, ...inserted(c.id)]),
  ] as StoryProject["chapters"];
  const parsed = storyProjectSchema.parse(project);
  compileProject(parsed);
  const data = {
    project: parsed,
    assets: [],
    warnings: [...(job.enhancement?.warnings ?? []), ...plan.warnings],
  };
  return { ...data, digest: digestBytes(JSON.stringify(data)) };
}

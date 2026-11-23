import {
  suppliedSource,
  validateSuppliedImages,
  validateSuppliedSources,
} from "./supplied-artwork.js";
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
  if (
    !plan ||
    plan.artwork.length ||
    job.assets.some((a) => a.origin !== "supplied")
  )
    throw new Error("Enhancements use vectors and supplied artwork only.");
  const existing = new Set(source.chapters.map((c) => c.id));
  const additions = new Set<string>();
  const protectedAnchors = new Map(
    (source.visualSequences ?? []).flatMap((sequence) =>
      sequence.steps
        .slice(0, -1)
        .map(
          (step) => [step.chapterId, sequence.steps.at(-1)!.chapterId] as const,
        ),
    ),
  );
  for (const chapter of plan.chapters) {
    if (existing.has(chapter.id) || additions.has(chapter.id))
      throw new Error("Visual chapter IDs must be new and unique.");
    if (chapter.afterChapterId && protectedAnchors.has(chapter.afterChapterId))
      throw new Error(
        `Cannot insert after ${chapter.afterChapterId} inside an existing visual sequence. Insert after the final chapter ${protectedAnchors.get(chapter.afterChapterId)} or before the sequence instead.`,
      );
    additions.add(chapter.id);
    if (chapter.type !== "illustrated" || !chapter.scene)
      throw new Error("Enhancements may only add illustration chapters.");
    if (
      chapter.afterChapterId === undefined ||
      (chapter.afterChapterId !== null && !existing.has(chapter.afterChapterId))
    )
      throw new Error("Each visual must be placed beside an existing chapter.");
  }
  validateSuppliedImages(
    plan,
    job.assets.map((a) => a.id),
  );
  validateSuppliedSources(job.assets, source.sources);
  const project = structuredClone(source);
  project.sources.push(
    ...job.assets
      .filter((a) => !source.sources.some((s) => s.id === a.id))
      .map(suppliedSource),
  );
  for (const sequence of plan.visualSequences ?? []) additions.add(sequence.id);
  if (plan.visualSequences?.length)
    project.visualSequences = [
      ...(source.visualSequences ?? []),
      ...plan.visualSequences,
    ];
  for (const accent of plan.visualAccents ?? []) additions.add(accent.id);
  if (plan.visualAccents?.length)
    project.visualAccents = [
      ...(source.visualAccents ?? []),
      ...plan.visualAccents,
    ];
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
    assets: job.assets,
    warnings: [...(job.enhancement?.warnings ?? []), ...plan.warnings],
  };
  return { ...data, digest: digestBytes(JSON.stringify(data)) };
}

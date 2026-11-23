import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import {
  parseStoryProject,
  generationJobSchema,
} from "@earth-stories/story-schema";
import { composePlan } from "./vector-plan.js";
import { assembleEnhancement } from "./enhancement.js";
const source = parseStoryProject(
  JSON.parse(
    await readFile(
      new URL("../../../../fixtures/field-notes/story.json", import.meta.url),
      "utf8",
    ),
  ),
);
const brief = {
  title: "Visual additions",
  audience: "",
  takeaway: "",
  narrative: "",
  visualDirection: "River",
  requestedOutputs: ["illustration"],
  references: [],
};
const plan = composePlan(
  {
    title: "Ignored replacement title",
    description: "Ignored",
    palette: "estuary",
    chapters: [
      {
        id: "visual",
        afterChapterId: source.chapters[0]!.id,
        title: "The river",
        narrative: "Illustrative scene.",
        alt: "River diagram",
        caption: "Illustrative",
        recipe: {
          template: "landscape",
          motif: "river",
          heading: "River",
          labels: ["Water", "Land"],
          motion: false,
        },
      },
    ],
    textEdits: [],
    warnings: [],
  },
  brief as never,
  true,
);
function job(p = plan) {
  return generationJobSchema.parse({
    id: "test-job",
    stage: "assembling",
    brief,
    plan: p,
    assets: [],
    candidate: null,
    error: null,
    createdAt: source.metadata.created,
    updatedAt: source.metadata.updated,
    usage: [],
    acceptance: null,
  });
}
it("preserves the project and existing chapter order while inserting a visual", () => {
  const result = assembleEnhancement(job(), source).project;
  expect(result.chapters.map((c) => c.id)).toEqual([
    source.chapters[0]!.id,
    "visual",
    ...source.chapters.slice(1).map((c) => c.id),
  ]);
  expect({
    ...result,
    chapters: result.chapters.filter((c) => c.id !== "visual"),
  }).toEqual(source);
});
it("rejects collisions, unknown anchors, nonvisual additions and ambiguous edits", () => {
  for (const patch of [
    { id: source.chapters[0]!.id },
    { afterChapterId: "missing" },
    { type: "prose", scene: null },
  ]) {
    expect(() =>
      assembleEnhancement(
        job({
          ...plan,
          chapters: [{ ...plan.chapters[0]!, ...patch }],
        } as never),
        source,
      ),
    ).toThrow();
  }
  expect(() =>
    assembleEnhancement(
      job({
        ...plan,
        textEdits: [
          {
            chapterId: source.chapters[0]!.id,
            before: "not present",
            after: "new",
            reason: "Visual support",
            visualChapterId: "visual",
          },
        ],
      }),
      source,
    ),
  ).toThrow();
});

it("applies only the exact supporting passage and records the proposed edit", () => {
  const edit = {
    chapterId: source.chapters[0]!.id,
    before: "A field team",
    after: "The field team",
    reason: "Introduce the neighboring illustration",
    visualChapterId: "visual",
  };
  const candidate = assembleEnhancement(
    job({ ...plan, textEdits: [edit] }),
    source,
  );
  expect(candidate.project.chapters[0]!.narrative).toBe(
    source.chapters[0]!.narrative.replace(edit.before, edit.after),
  );
  expect(candidate.project.chapters.slice(2)).toEqual(source.chapters.slice(1));
  expect(source.chapters[0]!.narrative).toContain("A field team");
});

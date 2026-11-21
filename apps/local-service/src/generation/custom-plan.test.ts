import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import {
  parseStoryProject,
  generationPlanIssues,
} from "@earth-stories/story-schema";
import {
  composePlan,
  vectorPlanJsonSchema,
  enhancementPlanJsonSchema,
} from "./vector-plan.js";
import { assembleEnhancement } from "./enhancement.js";
const brief = {
  title: "Visuals",
  audience: "Public",
  takeaway: "",
  narrative: "",
  visualDirection: "Illustrate the subject",
  references: [],
  requestedOutputs: ["animation" as const, "illustration" as const],
};
it("enhances existing prose with custom geometry without adding or changing chapters", async () => {
  const source = parseStoryProject(
    JSON.parse(await readFile("fixtures/field-notes/story.json", "utf8")),
  );
  const chapter = source.chapters.find((c) => c.type === "prose")!;
  const output = {
    title: "Visuals",
    description: "",
    palette: "alpine",
    chapters: [],
    textEdits: [],
    warnings: [],
    visualSequences: [
      {
        id: "custom",
        alt: "An ice boundary",
        caption: "Illustrative",
        steps: [{ chapterId: chapter.id, start: 0, end: 1 }],
        scene: {
          width: 1000,
          height: 800,
          layers: [
            {
              id: "ice",
              kind: "path",
              pathData: "M 0 0 L .8 .2 L 1 1 Z",
              keyframes: [
                { at: 0, x: 0, y: 0, scale: 1, opacity: 1, reveal: 1 },
                { at: 1, x: 0.3, y: 0, scale: 0.7, opacity: 1, reveal: 1 },
              ],
            },
          ],
        },
      },
    ],
  };
  const plan = composePlan(output, brief, true);
  expect(generationPlanIssues(plan, brief)).toEqual([]);
  const candidate = assembleEnhancement({ plan, assets: [] }, source);
  expect(candidate.project.chapters).toEqual(source.chapters);
  expect(candidate.project.sources).toEqual(source.sources);
  expect(candidate.project.visualSequences).toHaveLength(1);
  expect(source.visualSequences).toBeUndefined();
  const broken = structuredClone(plan);
  broken.visualSequences![0]!.steps[0]!.chapterId = "missing";
  expect(() =>
    assembleEnhancement({ plan: broken, assets: [] }, source),
  ).toThrow();
});

it("persists a sequence through preview, restart, apply, content editing, and publication", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { ProjectStore } = await import("@earth-stories/project-store");
  const { GenerationJobs } = await import("./jobs.js");
  const { compileProject } = await import("@earth-stories/publisher/compile");
  const root = await mkdtemp("/tmp/earth-custom-flow-");
  try {
    const store = new ProjectStore(root),
      source = await store.create({ title: "Custom scene" });
    const provider = {
      configured: true,
      plan: async () => ({
        plan: composePlan(
          {
            title: "Keep original",
            description: "",
            palette: "alpine",
            chapters: [],
            textEdits: [],
            warnings: [],
            visualSequences: [
              {
                id: "sequence",
                alt: "Moving ice",
                caption: "Illustrative",
                steps: [
                  { chapterId: source.chapters[0]!.id, start: 0, end: 1 },
                ],
                scene: {
                  width: 1000,
                  height: 800,
                  layers: [
                    {
                      id: "shape",
                      kind: "path",
                      pathData: "M 0 0 L 1 0 L .5 1 Z",
                      keyframes: [
                        { at: 0, x: 0, y: 0, scale: 1, opacity: 1, reveal: 1 },
                        {
                          at: 1,
                          x: 0.2,
                          y: 0.1,
                          scale: 1,
                          opacity: 1,
                          reveal: 1,
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
          brief,
          true,
        ),
        usage: {},
      }),
    };
    const jobs = new GenerationJobs(store, provider);
    await jobs.initialize();
    const created = await jobs.start(brief, source.id);
    await jobs.whenIdle();
    expect((await jobs.get(created.id)).stage).toBe("ready");
    expect((await jobs.preview(created.id)).visualSequences).toHaveLength(1);
    const reopened = new GenerationJobs(store, provider);
    await reopened.initialize();
    expect((await reopened.accept(created.id)).projectId).toBe(source.id);
    const saved = await store.read(source.id);
    expect(saved.chapters).toEqual(source.chapters);
    const edited = await store.save(saved.id, {
      ...saved,
      chapters: saved.chapters.map((c) => ({
        ...c,
        narrative: "Author edited this after applying.",
      })),
    });
    const manifest = compileProject(edited);
    expect(manifest.visualSequences).toEqual(saved.visualSequences);
    expect(manifest.chapters[0]!.narrative).toBe(
      "Author edited this after applying.",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("uses supported strict-output union and object forms for both provider schemas", () => {
  function inspect(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(inspect);
      return;
    }
    const schema = value as Record<string, unknown>;
    for (const keyword of ["oneOf", "allOf", "not", "default"])
      expect(schema).not.toHaveProperty(keyword);
    if (schema.properties) {
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required).toEqual(Object.keys(schema.properties));
    }
    Object.values(schema).forEach(inspect);
  }
  for (const schema of [vectorPlanJsonSchema, enhancementPlanJsonSchema]) {
    expect(schema.type).toBe("object");
    inspect(schema);
  }
});

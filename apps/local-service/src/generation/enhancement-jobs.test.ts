import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { ProjectStore } from "@earth-stories/project-store";
import {
  parseStoryProject,
  type GenerationProvider,
  visualAccentSchema,
} from "@earth-stories/story-schema";
import * as referencePreparation from "./reference-inputs.js";
import { GenerationJobs } from "./jobs.js";
import { composePlan } from "./vector-plan.js";
const fixture = new URL(
  "../../../../../../fixtures/field-notes/",
  import.meta.url,
);
const brief = {
  title: "Enhance river",
  audience: "Public",
  takeaway: "",
  narrative: "",
  visualDirection: "River illustration",
  references: [],
  requestedOutputs: ["illustration" as const],
};
it.each([false, true])(
  "uses existing context and applies only additions after restart (webpage notes: %s)",
  async (withWebpage) => {
    const referenceSpy = withWebpage
      ? vi
          .spyOn(referencePreparation, "prepareReferences")
          .mockResolvedValueOnce([
            {
              id: "reference-1",
              name: "Style page",
              classification: "visual-style",
              text: "Coast",
              warnings: ["Appearance unavailable"],
            },
          ])
      : null;
    const inputBrief = withWebpage
      ? {
          ...brief,
          references: [
            {
              kind: "url",
              name: "Style page",
              classification: "visual-style",
              url: "https://example.org/",
            },
          ],
        }
      : brief;
    const root = await mkdtemp(join(tmpdir(), "earth-enhance-"));
    try {
      const store = new ProjectStore(root);
      const template = parseStoryProject(
        JSON.parse(await readFile(new URL("story.json", fixture), "utf8")),
      );
      const bytes = await readFile(
        new URL("data/survey-sites.geojson", fixture),
      );
      const source = await store.createFromTemplate(
        { ...template, id: "example-enhance" },
        [{ path: "data/survey-sites.geojson", contents: bytes }],
      );
      let contextTitle = "";
      let dataSeen = false;
      const provider: GenerationProvider = {
        configured: true,
        plan: async (input, refs, _signal, context) => {
          contextTitle = context!.metadata.title;
          dataSeen = refs.some((r) => r.text?.includes("FeatureCollection"));
          return {
            plan: {
              ...composePlan(
                {
                  title: "Do not replace",
                  description: "Do not replace",
                  palette: "estuary",
                  chapters: [
                    {
                      id: "new-river",
                      afterChapterId: source.chapters[0]!.id,
                      title: "River flow",
                      narrative: "Illustrative, not measured.",
                      alt: "River illustration",
                      caption: "Illustrative",
                      recipe: {
                        template: "flow",
                        heading: "River",
                        labels: ["Land", "Water"],
                        motif: "river",
                        motion: false,
                      },
                    },
                  ],
                  textEdits: [],
                  warnings: [],
                },
                input,
                true,
              ),
              visualAccents: [
                visualAccentSchema.parse({
                  id: "clouds",
                  chapterId: source.chapters.at(-1)!.id,
                  placement: "trailing",
                  alt: "River clouds",
                  scene: {
                    width: 1000,
                    height: 500,
                    layers: [
                      {
                        id: "cloud",
                        kind: "path",
                        pathData: "M 0 0 L 1 0 L .5 1 Z",
                      },
                    ],
                  },
                }),
              ],
            },
            usage: {},
          };
        },
      };
      const jobs = new GenerationJobs(store, provider);
      await jobs.initialize();
      const created = await jobs.start(
        inputBrief,
        source.id,
        {},
        source.metadata.updated,
      );
      await jobs.whenIdle();
      const ready = await jobs.get(created.id);
      expect(ready.stage).toBe("ready");
      expect(await jobs.getBrief(created.id)).toEqual(inputBrief);
      if (withWebpage)
        expect(ready.candidate?.warnings).toContain(
          "Style page: Appearance unavailable",
        );
      expect(contextTitle).toBe(source.metadata.title);
      expect(dataSeen).toBe(true);
      expect(ready.candidate!.warnings.join(" ")).toContain(
        "no readable map preview",
      );
      expect((await jobs.preview(created.id)).assets[0]!.href).toContain(
        `/api/projects/${source.id}/assets/data/survey-sites.geojson`,
      );
      expect(await store.read(source.id)).toEqual(source);
      const reopened = new GenerationJobs(store, provider);
      await reopened.initialize();
      const receipt = await reopened.accept(created.id);
      expect(receipt.projectId).toBe(source.id);
      const saved = await store.read(source.id);
      expect(saved.chapters.filter((c) => c.id !== "new-river")).toEqual(
        source.chapters,
      );
      expect(saved.sources).toEqual(source.sources);
      expect(saved.visualAccents?.[0]).toMatchObject({
        id: "clouds",
        chapterId: source.chapters.at(-1)!.id,
      });
      expect(saved.metadata.title).toBe(source.metadata.title);
      expect(
        await readFile(store.assetPath(source.id, "data/survey-sites.geojson")),
      ).toEqual(bytes);
      expect(await reopened.accept(created.id)).toEqual(receipt);
      // A new candidate cannot replace later author edits.
      const next = await jobs.start(brief, source.id);
      await jobs.whenIdle();
      // The provider's reused ID is now a collision, which must fail closed.
      expect((await jobs.get(next.id)).stage).toBe("failed");
    } finally {
      referenceSpy?.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  },
);
it("blocks apply when a source asset changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "earth-enhance-assets-"));
  try {
    const store = new ProjectStore(root);
    const source = await store.create({ title: "Asset check" });
    await writeFile(store.assetPath(source.id, "data.csv"), "x,y\n1,2");
    const updated = await store.save(source.id, {
      ...source,
      sources: [
        {
          id: "table",
          kind: "csv",
          label: "Table",
          path: "data.csv",
          attribution: null,
        },
      ],
    });
    const provider: GenerationProvider = {
      configured: true,
      plan: async (input) => ({
        plan: composePlan(
          {
            title: "Ignored",
            description: "",
            palette: "clay",
            chapters: [
              {
                id: "visual",
                afterChapterId: null,
                title: "Flow",
                narrative: "Illustrative",
                alt: "Diagram",
                caption: "Illustrative",
                recipe: {
                  template: "diagram",
                  heading: "Flow",
                  labels: ["A", "B"],
                  motif: "river",
                  motion: false,
                },
              },
            ],
            textEdits: [],
            warnings: [],
          },
          input,
          true,
        ),
        usage: {},
      }),
    };
    const jobs = new GenerationJobs(store, provider);
    await jobs.initialize();
    const job = await jobs.start(brief, updated.id);
    await jobs.whenIdle();
    expect((await jobs.get(job.id)).stage).toBe("ready");
    await writeFile(store.assetPath(updated.id, "data.csv"), "x,y\n1,999");
    await expect(jobs.accept(job.id)).rejects.toThrow("asset changed");
    expect(await store.read(updated.id)).toEqual(updated);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("counts context preparation as active and cancels it before contacting the provider", async () => {
  const root = await mkdtemp(join(tmpdir(), "earth-enhance-cancel-"));
  try {
    const store = new ProjectStore(root);
    const source = await store.create({ title: "Cancel context" });
    let release!: (value: typeof source) => void;
    const read = vi.spyOn(store, "read").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const plan = vi.fn();
    const jobs = new GenerationJobs(store, { configured: true, plan });
    await jobs.initialize();
    const pending = jobs.start(brief, source.id);
    const rejected = expect(pending).rejects.toThrow();
    await expect.poll(() => read.mock.calls.length).toBe(1);
    expect(jobs.activity()).toBe(1);
    const cancelled = jobs.cancelActive();
    release(source);
    await rejected;
    await cancelled;
    await jobs.whenIdle();
    expect(jobs.activity()).toBe(0);
    expect(plan).not.toHaveBeenCalled();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

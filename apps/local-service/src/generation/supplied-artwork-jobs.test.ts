import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { ProjectStore } from "@earth-stories/project-store";
import {
  publicationManifestSchema,
  parseStoryProject,
  storyProjectSchema,
  storyBriefSchema,
  type GenerationProvider,
} from "@earth-stories/story-schema";
import { GenerationJobs } from "./jobs.js";
import { assembleEnhancement } from "./enhancement.js";
import { composePlan } from "./vector-plan.js";
import { buildArchivalHtml } from "@earth-stories/publisher";
import { compileFocusedChapter } from "@earth-stories/publisher/focused-preview";
import { compileProject } from "@earth-stories/publisher/compile";
it("stages illustration across the whole story, previews asset links, and applies durable artwork only after approval", async () => {
  const root = await mkdtemp(join(tmpdir(), "supplied-story-"));
  try {
    const store = new ProjectStore(root);
    const template = parseStoryProject(
      JSON.parse(
        await readFile(
          new URL(
            "../../../../fixtures/field-notes/story.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
    const source = await store.createFromTemplate(
      storyProjectSchema.parse({
        ...template,
        id: "example-supplied-story",
        sources: [],
        chapters: ["beginning", "middle", "end"].map((id) => ({
          id,
          type: "prose",
          title: id,
          narrative: `Original ${id} evidence.`,
        })),
        visualSequences: [],
        visualAccents: [],
      }),
      [],
    );
    const data = (await createCanvas(800, 600).encode("png")).toString(
      "base64",
    );
    const brief = storyBriefSchema.parse({
      title: "Ice",
      audience: "",
      takeaway: "",
      narrative: "",
      visualTreatment: "whole-story",
      visualDirection: "Use this artwork cohesively",
      references: [
        {
          kind: "upload",
          name: "Ice illustration",
          classification: "visual-style",
          mediaType: "image/png",
          data,
          artworkRole: "original",
        },
      ],
      requestedOutputs: ["illustration", "animation"],
    });
    const provider: GenerationProvider = {
      configured: true,
      plan: async (input, refs, _signal, context) => {
        expect(context).toEqual(source);
        const art = refs.find((r) => r.artwork)!;
        expect(art.image).toMatch(/^data:image\/png/);
        const scene = {
          width: 800,
          height: 600,
          layers: [
            {
              id: "ice",
              kind: "image",
              sourceId: art.artwork!.sourceId,
              alt: "Ice",
              keyframes: [
                { at: 0, x: 0, y: 0, scale: 1, opacity: 1, reveal: 1 },
                { at: 1, x: 0, y: 0, scale: 1.06, opacity: 1, reveal: 1 },
              ],
            },
          ],
        };
        return {
          plan: composePlan(
            {
              title: "Do not change",
              description: "",
              palette: "alpine",
              chapters: [
                {
                  id: "transition",
                  type: "illustrated",
                  title: "Ice boundary",
                  narrative: "",
                  alt: "Ice",
                  caption: "Illustrative",
                  scene,
                  afterChapterId: "middle",
                },
              ],
              visualSequences: [
                {
                  id: "opening-scene",
                  alt: "Ice",
                  caption: "Illustrative",
                  scene,
                  steps: [{ chapterId: "beginning", start: 0, end: 1 }],
                },
              ],
              visualAccents: [
                {
                  id: "ending-art",
                  alt: "Ice",
                  chapterId: "end",
                  placement: "trailing",
                  scene,
                },
              ],
              textEdits: [],
              warnings: [],
            },
            input,
            true,
            [art.artwork!.sourceId],
          ),
          usage: {},
        };
      },
    };
    const jobs = new GenerationJobs(store, provider);
    await jobs.initialize();
    const created = await jobs.start(
      brief,
      source.id,
      {},
      source.metadata.updated,
    );
    await jobs.whenIdle();
    const ready = await jobs.get(created.id);
    expect(ready.error).toBeNull();
    expect(ready.stage).toBe("ready");
    expect(await store.read(source.id)).toEqual(source);
    expect(await jobs.getBrief(created.id)).toEqual(brief);
    const preview = await jobs.preview(created.id);
    expect(preview.visualSequences?.[0]?.scene.layers[0]).toMatchObject({
      kind: "image",
      assetId: ready.assets[0]!.id,
    });
    expect(preview.visualAccents?.[0]?.scene.layers[0]).toMatchObject({
      kind: "image",
      assetId: ready.assets[0]!.id,
    });
    expect(preview.assets[0]?.href).toContain(
      `/api/generation/jobs/${created.id}/assets/`,
    );
    jobs.close();
    const restarted = new GenerationJobs(store, provider);
    await restarted.initialize();
    await restarted.accept(created.id);
    const saved = await store.read(source.id);
    expect(compileFocusedChapter(saved, "beginning").status).toBe("ready");
    expect(compileFocusedChapter(saved, "end").status).toBe("ready");
    const manifest = compileProject(saved);
    const imageOnlyVisuals = {
      ...manifest,
      chapters: manifest.chapters.filter((c) => c.type !== "illustrated"),
      assets: [],
    };
    expect(publicationManifestSchema.safeParse(imageOnlyVisuals).success).toBe(
      false,
    );
    expect(saved.chapters.filter((c) => c.id !== "transition")).toEqual(
      source.chapters,
    );
    expect(saved.publication).toEqual(source.publication);
    expect(saved.sources[0]?.attribution).not.toBe("AI-generated illustration");
    expect(
      await readFile(join(root, source.id, ready.assets[0]!.path)),
    ).toEqual(await restarted.asset(created.id, ready.assets[0]!.path));
    await restarted.accept(created.id);
    await restarted.discard(created.id);
    expect(compileProject(await store.read(source.id)).assets[0]?.id).toBe(
      ready.assets[0]!.id,
    );
    // Reusing the same image in a later enhancement preserves the source and its metadata.
    const secondPlan = {
      ...ready.plan!,
      chapters: ready.plan!.chapters.map((c) => ({
        ...c,
        id: "second-transition",
        afterChapterId: "end",
      })),
      visualSequences: [],
      visualAccents: [],
    };
    const named = await store.save(source.id, {
      ...saved,
      sources: saved.sources.map((s) => ({
        ...s,
        label: "Author's chosen label",
        attribution: "Supplied by author",
      })),
    });
    for (const conflict of [
      { path: "assets/different.png" },
      { sizeBytes: 1234567 },
      { delivery: "excluded" },
    ]) {
      expect(() =>
        assembleEnhancement(
          { plan: secondPlan, assets: ready.assets },
          {
            ...named,
            sources: named.sources.map((s) => ({
              ...s,
              ...conflict,
            })) as typeof named.sources,
          },
        ),
      ).toThrow(/conflicts with an existing source/);
    }
    const reuseJobs = new GenerationJobs(store, {
      configured: true,
      plan: async () => ({ plan: secondPlan, usage: {} }),
    });
    await reuseJobs.initialize();
    const reused = await reuseJobs.start(
      { ...brief, visualTreatment: "focused" },
      source.id,
      {},
      named.metadata.updated,
    );
    await reuseJobs.whenIdle();
    expect((await reuseJobs.get(reused.id)).error).toBeNull();
    expect((await reuseJobs.get(reused.id)).stage).toBe("ready");
    await reuseJobs.accept(reused.id);
    expect((await store.read(source.id)).sources).toEqual(named.sources);
    expect((await store.read(source.id)).chapters.at(-1)?.id).toBe(
      "second-transition",
    );
    expect(
      await readFile(join(root, source.id, ready.assets[0]!.path)),
    ).toEqual(await reuseJobs.asset(reused.id, ready.assets[0]!.path));
    reuseJobs.close();
    const archive = await buildArchivalHtml({
      project: saved,
      manifest: compileProject(saved),
      projectDirectory: join(root, source.id),
    });
    const figures = [
      ...archive.matchAll(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/g),
    ].map((m) => Buffer.from(m[1]!, "base64").toString());
    expect(figures).toHaveLength(3);
    for (const svg of figures)
      expect(svg).toContain('<image href="data:image/png;base64,');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

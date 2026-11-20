import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { ProjectStore } from "@earth-stories/project-store";
import {
  defaultReaderPalette,
  type GenerationProvider,
} from "@earth-stories/story-schema";
import { GenerationJobs } from "./jobs.js";
const brief = {
  title: "River",
  audience: "Public",
  takeaway: "Water",
  narrative: "Fictional",
  visualDirection: "Ink",
  references: [],
  requestedOutputs: ["prose" as const],
};
const provider: GenerationProvider = {
  configured: true,
  plan: async () => ({
    plan: {
      title: "River",
      description: "A fictional river",
      palette: {
        ...defaultReaderPalette,
        mutedText: defaultReaderPalette.text,
      },
      chapters: [
        {
          id: "opening",
          type: "prose",
          title: "Water",
          narrative: "A fictional river flows.",
          alt: "",
          caption: "",
          scene: null,
        },
      ],
      artwork: [],
      warnings: [],
    },
    usage: {},
  }),
  illustrate: vi.fn(),
};
it("keeps candidates outside the workspace until accepted and imports exactly once", async () => {
  const root = await mkdtemp(join(tmpdir(), "earth-generation-"));
  try {
    const store = new ProjectStore(root);
    const jobs = new GenerationJobs(store, provider);
    await jobs.initialize();
    const created = await jobs.start(brief);
    await jobs.whenIdle();
    const ready = await jobs.get(created.id);
    expect(ready.stage).toBe("ready");
    expect(await store.list()).toEqual([]);
    const [a, b] = await Promise.all([
      jobs.accept(created.id),
      jobs.accept(created.id),
    ]);
    expect(a).toEqual(b);
    expect(await store.list()).toHaveLength(1);
    expect((await store.read(a.projectId)).chapters).toEqual(
      ready.candidate?.project.chapters,
    );
    const restarted = new GenerationJobs(store, provider);
    await restarted.initialize();
    expect(await restarted.accept(created.id)).toEqual(a);
    await restarted.discard(created.id);
    expect(await store.list()).toHaveLength(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("does not promote a late provider response after cancellation", async () => {
  const root = await mkdtemp(join(tmpdir(), "earth-cancel-"));
  let resolve!: (
    value: Awaited<ReturnType<GenerationProvider["plan"]>>,
  ) => void;
  const late = {
    ...provider,
    plan: () =>
      new Promise<Awaited<ReturnType<GenerationProvider["plan"]>>>((r) => {
        resolve = r;
      }),
  };
  try {
    const jobs = new GenerationJobs(new ProjectStore(root), late);
    await jobs.initialize();
    const job = await jobs.start(brief);
    await vi.waitFor(() => expect(resolve).toBeDefined());
    await jobs.cancel(job.id);
    resolve(await provider.plan(brief, [], new AbortController().signal));
    await jobs.whenIdle();
    expect((await jobs.get(job.id)).stage).toBe("cancelled");
    expect((await jobs.get(job.id)).candidate).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("recovers acceptance after project rename succeeds but the job receipt write is interrupted", async () => {
  const root = await mkdtemp(join(tmpdir(), "earth-receipt-"));
  try {
    const store = new ProjectStore(root),
      jobs = new GenerationJobs(store, provider);
    await jobs.initialize();
    const job = await jobs.start(brief);
    await jobs.whenIdle();
    const original = store.importCandidate.bind(store);
    vi.spyOn(store, "importCandidate").mockImplementationOnce(async (input) => {
      await original(input);
      throw new Error("Simulated interruption after rename");
    });
    await expect(jobs.accept(job.id)).rejects.toThrow("Simulated");
    expect(await store.list()).toHaveLength(1);
    const restarted = new GenerationJobs(new ProjectStore(root), provider);
    await restarted.initialize();
    const accepted = await restarted.accept(job.id);
    expect(accepted.projectId).toBe(`story-${job.id}`);
    expect(await store.list()).toHaveLength(1);
    const saved = await store.read(accepted.projectId);
    saved.chapters[0]!.narrative = "Edited by the author";
    await store.save(saved.id, saved);
    expect((await store.read(saved.id)).chapters[0]?.narrative).toBe(
      "Edited by the author",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("retries artwork from validated checkpoints, then compiles the same accepted scene", async () => {
  const { createCanvas } = await import("@napi-rs/canvas");
  const canvas = createCanvas(8, 8);
  const context = canvas.getContext("2d");
  context.fillStyle = "teal";
  context.fillRect(0, 0, 8, 8);
  const bytes = await canvas.encode("png");
  const { sceneSchema } = await import("@earth-stories/story-schema");
  const { compileProject } = await import("@earth-stories/publisher/compile");
  const plan = (await provider.plan(brief, [], new AbortController().signal))
    .plan;
  plan.artwork = [
    {
      id: "background",
      prompt: "River background",
      width: 1024,
      height: 1024,
      referenceIds: [],
    },
    {
      id: "foreground",
      prompt: "River foreground",
      width: 1024,
      height: 1024,
      referenceIds: [],
    },
  ];
  plan.chapters.push({
    id: "scene",
    type: "illustrated",
    title: "River scene",
    narrative: "Fictional illustration",
    alt: "River",
    caption: "Illustration",
    scene: sceneSchema.parse({
      width: 1000,
      height: 600,
      layers: [
        {
          id: "back",
          kind: "image",
          sourceId: "background",
          alt: "River banks",
        },
        { id: "front", kind: "image", sourceId: "foreground", alt: "Water" },
      ],
    }),
  });
  let fail = true;
  const illustrate = vi.fn(async (request: { id: string }) => {
    if (request.id === "foreground" && fail)
      throw new Error("Temporary artwork failure");
    return { bytes, model: "test-model", usage: { images: 1 } };
  });
  const root = await mkdtemp(join(tmpdir(), "earth-checkpoint-"));
  try {
    const store = new ProjectStore(root),
      jobs = new GenerationJobs(store, {
        configured: true,
        plan: async () => ({ plan, usage: {} }),
        illustrate,
      });
    await jobs.initialize();
    const created = await jobs.start(brief);
    await jobs.whenIdle();
    expect((await jobs.get(created.id)).stage).toBe("failed");
    fail = false;
    await jobs.retry(created.id);
    await jobs.whenIdle();
    const job = await jobs.get(created.id);
    expect(job.stage, job.error ?? undefined).toBe("ready");
    expect(
      illustrate.mock.calls.filter(([r]) => r.id === "background"),
    ).toHaveLength(1);
    const accepted = await jobs.accept(created.id);
    expect(compileProject(await store.read(accepted.projectId))).toEqual(
      compileProject(job.candidate!.project),
    );
    await expect(
      jobs.asset(created.id, "assets/../../secret"),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("recovers interrupted work on restart and refuses overlapping requests", async () => {
  const { writeFile } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "earth-restart-"));
  try {
    const store = new ProjectStore(root),
      jobs = new GenerationJobs(store, provider);
    await jobs.initialize();
    const created = await jobs.start(brief);
    await expect(jobs.start(brief)).rejects.toThrow("running");
    await jobs.whenIdle();
    const job = await jobs.get(created.id);
    job.stage = "illustrating";
    job.candidate = null;
    await writeFile(
      join(root, ".generation", job.id, "job.json"),
      JSON.stringify(job),
    );
    const restarted = new GenerationJobs(store, provider);
    await restarted.initialize();
    expect((await restarted.get(job.id)).stage).toBe("failed");
    await restarted.retry(job.id);
    await restarted.whenIdle();
    expect((await restarted.get(job.id)).stage).toBe("ready");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("rejects symlinked candidate files and encoded traversal", async () => {
  const { symlink, writeFile } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "earth-generation-paths-"));
  try {
    const store = new ProjectStore(root),
      jobs = new GenerationJobs(store, provider);
    await jobs.initialize();
    const created = await jobs.start(brief);
    await jobs.whenIdle();
    const outside = join(root, "outside.png");
    await writeFile(outside, "private");
    const path = `assets/${"a".repeat(64)}.png`;
    await symlink(outside, join(root, ".generation", created.id, path));
    await expect(jobs.asset(created.id, path)).rejects.toThrow("symbolic");
    await expect(
      jobs.asset(created.id, "assets/%2e%2e/outside.png"),
    ).rejects.toThrow("Invalid");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("keeps uploaded inputs out of polling checkpoints and accepted briefs while retaining retry inputs", async () => {
  const { readFile, stat } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "earth-reference-storage-"));
  try {
    const plan = vi
      .fn()
      .mockRejectedValueOnce(new Error("Temporary planning failure"))
      .mockImplementation(provider.plan);
    const store = new ProjectStore(root);
    const jobs = new GenerationJobs(store, { ...provider, plan });
    await jobs.initialize();
    const text = "Reference context. ".repeat(8000);
    const data = Buffer.from(text).toString("base64");
    const job = await jobs.start({
      ...brief,
      references: [
        {
          kind: "upload",
          name: "Context.txt",
          classification: "background",
          mediaType: "text/plain",
          data,
        },
      ],
    });
    await jobs.whenIdle();
    const path = join(root, ".generation", job.id, "job.json");
    expect((await stat(path)).size).toBeLessThan(10000);
    expect(JSON.stringify(await jobs.get(job.id))).not.toContain(data);
    const restarted = new GenerationJobs(store, { ...provider, plan });
    await restarted.initialize();
    await restarted.retry(job.id);
    await restarted.whenIdle();
    expect((await restarted.get(job.id)).stage).toBe("ready");
    expect(plan.mock.calls[1]![1][0].text).toBe(text);
    const receipt = await restarted.accept(job.id);
    const accepted = await readFile(
      join(root, receipt.projectId, ".earth-stories", "generation-brief.json"),
      "utf8",
    );
    expect(accepted).toContain("Context.txt");
    expect(accepted).not.toContain(data);
    expect(accepted.length).toBeLessThan(10000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("migrates legacy inline references once at restart without losing retry context", async () => {
  const { readFile, writeFile, unlink } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "earth-legacy-references-"));
  try {
    const store = new ProjectStore(root);
    const jobs = new GenerationJobs(store, provider);
    await jobs.initialize();
    const created = await jobs.start(brief);
    await jobs.whenIdle();
    const folder = join(root, ".generation", created.id);
    const path = join(folder, "job.json");
    const legacy = JSON.parse(await readFile(path, "utf8"));
    legacy.stage = "failed";
    legacy.plan = null;
    legacy.brief.references = [
      {
        kind: "text",
        name: "Earlier context",
        classification: "facts",
        text: "A supplied reference.",
      },
    ];
    delete legacy.referenceStorage;
    delete legacy.referenceMetadata;
    await writeFile(path, JSON.stringify(legacy));
    await unlink(join(folder, "references.json"));
    const plan = vi.fn(provider.plan);
    const restarted = new GenerationJobs(store, { ...provider, plan });
    await restarted.initialize();
    expect((await restarted.get(created.id)).brief.references).toEqual([]);
    await restarted.retry(created.id);
    await restarted.whenIdle();
    expect(plan.mock.calls[0]![1][0].text).toBe("A supplied reference.");
    expect((await restarted.get(created.id)).stage).toBe("ready");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

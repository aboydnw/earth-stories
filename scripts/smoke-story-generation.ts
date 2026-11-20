import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ProjectStore } from "@earth-stories/project-store";
import { buildLatestPublication } from "@earth-stories/publisher";
import {
  defaultReaderPalette,
  sceneSchema,
  type GenerationProvider,
  type StoryBrief,
} from "@earth-stories/story-schema";
import { GenerationJobs } from "../apps/local-service/src/generation/jobs.js";
import { OpenAIProvider } from "../apps/local-service/src/generation/openai-provider.js";
const mock = process.argv.includes("--mock");
let provider: GenerationProvider = new OpenAIProvider();
if (!mock && !provider.configured) {
  console.log(
    JSON.stringify({
      status: "blocked",
      reason: "OPENAI_API_KEY is not configured. No live request was made.",
    }),
  );
  process.exit(2);
}
if (mock) {
  const { createCanvas } = await import("@napi-rs/canvas");
  const canvas = createCanvas(1024, 1024),
    context = canvas.getContext("2d");
  context.fillStyle = "#dbe9e5";
  context.fillRect(0, 0, 1024, 1024);
  context.strokeStyle = "#006b7a";
  context.lineWidth = 100;
  context.beginPath();
  context.moveTo(100, 0);
  context.bezierCurveTo(900, 300, 100, 700, 850, 1024);
  context.stroke();
  const bytes = await canvas.encode("png");
  provider = {
    configured: true,
    plan: async () => ({
      usage: { mock: true },
      plan: {
        title: "A fictional river",
        description: "A simulated generation for end-to-end verification.",
        palette: {
          ...defaultReaderPalette,
          text: "#17313a",
          mutedText: "#344955",
          accent: "#006b7a",
          accentText: "#005463",
        },
        chapters: [
          {
            id: "river",
            type: "illustrated",
            title: "From source to sea",
            narrative:
              "This fictional river illustrates a journey. It is not measured data.",
            alt: "A blue river running through pale land",
            caption: "Simulated artwork for verification",
            scene: sceneSchema.parse({
              width: 1000,
              height: 700,
              staticProgress: 0.5,
              layers: [
                {
                  id: "art",
                  kind: "image",
                  sourceId: "river-art",
                  alt: "Fictional river",
                  keyframes: [
                    { at: 0, x: 0, y: -0.1, scale: 1, opacity: 1, reveal: 1 },
                    { at: 1, x: 0, y: 0, scale: 1, opacity: 1, reveal: 1 },
                  ],
                },
                {
                  id: "label",
                  kind: "text",
                  text: "River to sea",
                  x: 0.1,
                  y: 0.1,
                  width: 0.8,
                  height: 0.2,
                },
              ],
            }),
          },
          {
            id: "closing",
            type: "prose",
            title: "The journey continues",
            narrative: "Placeholder: add your closing takeaway.",
            alt: "",
            caption: "",
            scene: null,
          },
        ],
        artwork: [
          {
            id: "river-art",
            prompt: "A fictional river compositing layer",
            referenceIds: [],
            width: 1024,
            height: 1024,
          },
        ],
        warnings: [
          "This is an explicit mock provider test, not live AI output.",
        ],
      },
    }),
    illustrate: async () => ({
      bytes,
      model: "mock-raster",
      usage: { images: 1 },
    }),
  };
}
const root = await mkdtemp(join(tmpdir(), "earth-generation-smoke-"));
const store = new ProjectStore(join(root, "projects")),
  jobs = new GenerationJobs(store, provider);
await jobs.initialize();
const brief: StoryBrief = {
  title: "A fictional river",
  audience: "General readers",
  takeaway: "Follow an imagined river from source to sea",
  narrative:
    "Create exactly two chapters: one layered illustration and one short prose ending. This is a fictional scene, not factual geographic data.",
  visualDirection:
    "Restrained paper illustration, teal water, warm pale land, one generated image layer and one text layer, subtle scroll movement.",
  references: [],
  requestedOutputs: ["illustration", "animation", "prose"],
};
const started = await jobs.start(brief);
await jobs.whenIdle();
const ready = await jobs.get(started.id);
if (ready.stage !== "ready")
  throw new Error(`Generation ${ready.stage}: ${ready.error}`);
if ((await store.list()).length)
  throw new Error("Candidate became a project before acceptance.");
const candidatePreview = await jobs.preview(started.id);
const receipt = await jobs.accept(started.id);
const repeated = await jobs.accept(started.id);
if (receipt.projectId !== repeated.projectId)
  throw new Error("Acceptance duplicated the project.");
let project = await store.read(receipt.projectId);
if (
  project.chapters.map((c) => c.id).join() !==
  candidatePreview.chapters.map((c) => c.id).join()
)
  throw new Error("Chapter identities changed.");
project.chapters[project.chapters.length - 1]!.narrative =
  "Edited by the author after accepting the candidate.";
await store.save(project.id, project);
project = await store.read(project.id);
if (!project.chapters.at(-1)?.narrative.startsWith("Edited by"))
  throw new Error("Author edits were not persisted.");
const publication = await buildLatestPublication({
  projectDirectory: store.projectPath(project.id),
  viewerDirectory: resolve("dist/viewer"),
});
const report = {
  status: "passed",
  provider: mock ? "explicit mock" : "live OpenAI",
  root,
  jobId: started.id,
  projectId: project.id,
  candidateDigest: receipt.candidateDigest,
  chapters: project.chapters.length,
  artwork: ready.assets.length,
  publication: publication.directory,
  usage: ready.usage,
};
await writeFile(join(root, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

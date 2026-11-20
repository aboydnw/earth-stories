import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ProjectStore } from "@earth-stories/project-store";
import { buildLatestPublication } from "@earth-stories/publisher";
import {
  type GenerationProvider,
  type StoryBrief,
} from "@earth-stories/story-schema";
import { GenerationJobs } from "../apps/local-service/src/generation/jobs.js";
import { composePlan } from "../apps/local-service/src/generation/vector-plan.js";
const mock = process.argv.includes("--mock");
if (!mock) {
  console.log(
    JSON.stringify({
      status: "blocked",
      reason:
        "For a live test, Continue with ChatGPT in the running local editor and generate a story there. This script does not read credentials.",
    }),
  );
  process.exit(2);
}
const provider: GenerationProvider = {
  configured: true,
  plan: async (brief) => ({
    plan: composePlan(
      {
        title: "A fictional river",
        description: "An editorial vector journey",
        palette: "estuary",
        chapters: [
          {
            id: "scene",
            title: "Follow the water",
            narrative:
              "This fictional river is an illustration, not measured geographic data.",
            alt: "Layered river landscape",
            caption: "Illustrative vector scene",
            recipe: {
              template: "landscape",
              heading: "Follow the water",
              labels: ["Headwaters", "Coast"],
              motif: "river",
              motion: true,
            },
          },
          {
            id: "ending",
            title: "At the coast",
            narrative: "An illustrative ending.",
            alt: "",
            caption: "",
            recipe: null,
          },
        ],
        warnings: [
          "Illustrative content; verify factual claims before publishing.",
        ],
      },
      brief,
    ),
    usage: {},
  }),
};
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
    "Restrained paper illustration, teal water, warm pale land, curated vector layers and text, subtle scroll movement.",
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
  provider: mock ? "explicit mock" : "live ChatGPT",
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

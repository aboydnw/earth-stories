import { createHash } from "node:crypto";
import { compileProject } from "@earth-stories/publisher/compile";
import {
  storyProjectSchema,
  paletteContrastWarnings,
  type GenerationJob,
  type GenerationCandidate,
} from "@earth-stories/story-schema";
export const digestBytes = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export function assembleCandidate(job: GenerationJob): GenerationCandidate {
  const plan = job.plan;
  if (!plan) throw new Error("A story plan is required.");
  if (paletteContrastWarnings(plan.palette).length)
    throw new Error(
      "Generated palette does not meet text contrast requirements.",
    );
  const project = storyProjectSchema.parse({
    schema: "earth-stories/project/v3",
    id: `story-${job.id}`,
    metadata: {
      title: plan.title,
      description: plan.description,
      author: null,
      created: job.createdAt,
      updated: job.createdAt,
    },
    publication: {
      profile: "custom",
      theme: "editorial",
      palette: plan.palette,
    },
    basemap: {
      id: "neutral",
      label: "Neutral",
      styleUrl: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      attribution: null,
    },
    sources: job.assets.map((asset) => ({
      id: asset.id,
      kind: "image",
      label: `Generated illustration ${asset.id}`,
      path: asset.path,
      delivery: "included",
      sizeBytes: asset.sizeBytes,
      attribution: "AI-generated illustration",
      provenance: {
        publisher: "OpenAI",
        transformations: [
          `Generated with ${asset.model}`,
          `Prompt: ${asset.prompt}`,
        ],
      },
    })),
    chapters: plan.chapters.map((chapter) =>
      chapter.type === "prose"
        ? {
            id: chapter.id,
            type: "prose",
            title: chapter.title,
            narrative: chapter.narrative,
          }
        : { ...chapter, scene: chapter.scene },
    ),
    dataAssets: [],
    visualSequences: plan.visualSequences,
  });
  compileProject(project);
  const data = { project, assets: job.assets, warnings: plan.warnings };
  return { ...data, digest: digestBytes(JSON.stringify(data)) };
}

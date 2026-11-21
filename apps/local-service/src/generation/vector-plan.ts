import { z } from "zod";
import {
  composeVectorScene,
  vectorScenePalettes,
  vectorRecipeSchema,
  storyPlanSchema,
  type StoryBrief,
  enhancementTextEditSchema,
  visualSequencesSchema,
  vectorSceneSchema,
  validateVisualSequences,
} from "@earth-stories/story-schema";
export const vectorPlanSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000),
    palette: z.enum(["estuary", "clay", "alpine"]),
    chapters: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/),
            title: z.string().min(1).max(200),
            narrative: z.string().max(20000),
            alt: z.string().max(2000),
            caption: z.string().max(2000),
            recipe: vectorRecipeSchema.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    warnings: z.array(z.string().max(2000)).max(30),
  })
  .strict();
export const enhancementVectorPlanSchema = vectorPlanSchema.extend({
  chapters: z
    .array(
      vectorPlanSchema.shape.chapters.element.extend({
        afterChapterId: z.string().nullable(),
        recipe: vectorRecipeSchema,
      }),
    )
    .min(1)
    .max(12),
  textEdits: z.array(enhancementTextEditSchema).max(8),
});
const { $schema: _enhancementDialect, ...enhancementJson } = z.toJSONSchema(
  enhancementVectorPlanSchema,
  { target: "draft-7" },
);
export const legacyEnhancementPlanJsonSchema = enhancementJson;
const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(vectorPlanSchema, {
  target: "draft-7",
});
export const legacyVectorPlanJsonSchema = jsonSchema;
export function composePlan(
  value: unknown,
  brief: StoryBrief,
  enhancement = false,
) {
  if (value && typeof value === "object" && "visualSequences" in value) {
    const custom = (
      enhancement ? customEnhancementPlanSchema : customVectorPlanSchema
    ).parse(value);
    const parsed = storyPlanSchema.parse({
      ...custom,
      palette: vectorScenePalettes[custom.palette],
      artwork: [],
    });
    if (!brief.requestedOutputs.includes("animation")) {
      for (const seq of parsed.visualSequences ?? [])
        seq.scene.motionStrength = 0;
      for (const chapter of parsed.chapters)
        if (chapter.scene) chapter.scene.motionStrength = 0;
    }
    if (brief.requestedOutputs.includes("animation")) {
      const scenes = [
        ...(parsed.visualSequences ?? []).map((s) => s.scene),
        ...parsed.chapters.flatMap((c) => (c.scene ? [c.scene] : [])),
      ];
      const meaningful = scenes.some(
        (scene) =>
          scene.motionStrength > 0 &&
          scene.layers.some(
            (layer) =>
              layer.kind === "path" &&
              layer.keyframes.some((frame) => {
                const first = layer.keyframes[0]!;
                return (
                  Math.abs(frame.x - first.x) > 0.02 ||
                  Math.abs(frame.y - first.y) > 0.02 ||
                  Math.abs(frame.scale - first.scale) > 0.05 ||
                  Math.abs((frame.rotation ?? 0) - (first.rotation ?? 0)) > 5 ||
                  Math.abs(frame.reveal - first.reveal) > 0.1
                );
              }),
          ),
      );
      if (!meaningful)
        throw new Error(
          "Requested animation must change vector geometry visibly; fading text alone is insufficient.",
        );
    }
    if (!enhancement) {
      const issues = validateVisualSequences(
        parsed.chapters,
        parsed.visualSequences,
      );
      if (issues.length) throw new Error(issues.join("; "));
    }
    return parsed;
  }
  const plan = (
    enhancement ? enhancementVectorPlanSchema : vectorPlanSchema
  ).parse(value);
  return storyPlanSchema.parse({
    ...plan,
    palette: vectorScenePalettes[plan.palette],
    artwork: [],
    chapters: plan.chapters.map(({ recipe, ...chapter }) => ({
      ...chapter,
      type: recipe ? "illustrated" : "prose",
      scene: recipe
        ? composeVectorScene({
            ...recipe,
            motion:
              brief.requestedOutputs.includes("animation") && recipe.motion,
          })
        : null,
    })),
  });
}

const customChapter = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/),
    type: z.enum(["prose", "illustrated"]),
    title: z.string().min(1).max(200),
    narrative: z.string().max(20000),
    alt: z.string().max(2000),
    caption: z.string().max(2000),
    scene: vectorSceneSchema.nullable(),
  })
  .strict();
export const customVectorPlanSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000),
    palette: z.enum(["estuary", "clay", "alpine"]),
    chapters: z.array(customChapter).min(1).max(20),
    visualSequences: visualSequencesSchema,
    warnings: z.array(z.string().max(2000)).max(30),
  })
  .strict();
export const customEnhancementPlanSchema = customVectorPlanSchema.extend({
  chapters: z
    .array(customChapter.extend({ afterChapterId: z.string().nullable() }))
    .max(12),
  textEdits: z.array(enhancementTextEditSchema).max(8),
});
function strictProviderSchema(schema: z.ZodType): Record<string, unknown> {
  const visit = (value: unknown): any => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const result: Record<string, any> = {};
    for (const [key, child] of Object.entries(value))
      if (key !== "default" && key !== "$schema") result[key] = visit(child);
    if (result.properties) {
      result.required = Object.keys(result.properties);
      result.additionalProperties = false;
    }
    return result;
  };
  return visit(z.toJSONSchema(schema, { target: "draft-7" }));
}
export const vectorPlanJsonSchema = strictProviderSchema(
  customVectorPlanSchema,
);
export const enhancementPlanJsonSchema = strictProviderSchema(
  customEnhancementPlanSchema,
);

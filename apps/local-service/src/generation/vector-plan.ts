import { z } from "zod";
import {
  composeVectorScene,
  vectorScenePalettes,
  vectorRecipeSchema,
  storyPlanSchema,
  type StoryBrief,
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
const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(vectorPlanSchema, {
  target: "draft-7",
});
export const vectorPlanJsonSchema = jsonSchema;
export function composePlan(value: unknown, brief: StoryBrief) {
  const plan = vectorPlanSchema.parse(value);
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

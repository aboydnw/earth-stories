import { z } from "zod";
import { sceneSchema, type SceneDefinition } from "./illustration.js";
export const artworkMotionSchema = z
  .object({
    layers: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            dx: z.number().finite().min(-0.08).max(0.08),
            dy: z.number().finite().min(-0.08).max(0.08),
            scale: z.number().finite().min(1).max(1.08),
          })
          .strict(),
      )
      .min(1)
      .max(6)
      .refine(
        (layers) => new Set(layers.map((l) => l.id)).size === layers.length,
        "Layer IDs must be unique",
      ),
  })
  .strict();
export type ArtworkMotion = z.infer<typeof artworkMotionSchema>;
export const artworkMotionInputSchema = z
  .object({
    direction: z.string().trim().min(1).max(4000),
    context: z.string().max(20000),
    model: z.string().min(1).max(200).optional(),
    images: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            name: z.string().max(2000),
            data: z
              .string()
              .min(1)
              .max(3 * 1024 * 1024)
              .regex(/^[A-Za-z0-9+/]+={0,2}$/),
          })
          .strict(),
      )
      .min(1)
      .max(6)
      .refine(
        (images) => new Set(images.map((i) => i.id)).size === images.length,
        "Image IDs must be unique",
      ),
  })
  .strict();
export type ArtworkMotionInput = z.infer<typeof artworkMotionInputSchema>;
export function applyArtworkMotion(
  scene: SceneDefinition,
  input: unknown,
): SceneDefinition {
  const plan = artworkMotionSchema.parse(input);
  const images = scene.layers.filter((l) => l.kind === "image");
  if (
    images.length !== plan.layers.length ||
    plan.layers.some((l) => !images.some((i) => i.id === l.id))
  )
    throw new Error(
      "Motion must match every supplied image layer exactly once.",
    );
  return sceneSchema.parse({
    ...scene,
    layers: scene.layers.map((layer) => {
      const motion = plan.layers.find((l) => l.id === layer.id);
      if (!motion) return layer;
      const start = {
        at: 0,
        x: layer.x,
        y: layer.y,
        scale: 1,
        opacity: 1,
        reveal: 1,
      };
      return {
        ...layer,
        keyframes: [
          start,
          {
            ...start,
            at: 1,
            x: layer.x + motion.dx,
            y: layer.y + motion.dy,
            scale: motion.scale,
          },
        ],
      };
    }),
  });
}

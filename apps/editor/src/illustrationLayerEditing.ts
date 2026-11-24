import { sceneLayerSchema, type SceneLayer } from "@earth-stories/story-schema";
export type LayerMotion = "still" | "rise" | "left" | "right" | "closer";
function validated(previous: SceneLayer, next: SceneLayer): SceneLayer {
  const result = sceneLayerSchema.safeParse(next);
  return result.success ? result.data : previous;
}
export function positionLayer(
  layer: SceneLayer,
  axis: "x" | "y",
  value: number,
): SceneLayer {
  const delta = value - layer[axis];
  return validated(layer, {
    ...layer,
    [axis]: value,
    keyframes: layer.keyframes.map((k) => ({ ...k, [axis]: k[axis] + delta })),
  });
}
export function resizeLayer(layer: SceneLayer, width: number): SceneLayer {
  return validated(layer, {
    ...layer,
    width,
    height: (layer.height * width) / layer.width,
  });
}
export function motionLayer(
  layer: SceneLayer,
  motion: LayerMotion,
): SceneLayer {
  if (motion === "still") return { ...layer, keyframes: [] };
  const start = {
    at: 0,
    x: layer.x,
    y: layer.y,
    scale: 1,
    opacity: 1,
    reveal: 1,
  };
  const end = { ...start, at: 1 };
  if (motion === "rise") end.y -= 0.04;
  if (motion === "left") end.x -= 0.04;
  if (motion === "right") end.x += 0.04;
  if (motion === "closer") {
    end.scale = 1.04;
    end.x -= layer.width * 0.02;
    end.y -= layer.height * 0.02;
  }
  return validated(layer, { ...layer, keyframes: [start, end] });
}

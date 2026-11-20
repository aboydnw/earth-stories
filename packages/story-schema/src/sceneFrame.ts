import type {
  SceneDefinition,
  PublicationScene,
  SceneKeyframe,
} from "./illustration.js";
export type SceneFrame = Array<Omit<SceneKeyframe, "at"> & { id: string }>;
export function sceneFrame(
  scene: SceneDefinition | PublicationScene,
  progress: number,
): SceneFrame {
  const t = Number.isFinite(progress)
    ? Math.min(1, Math.max(0, progress))
    : scene.staticProgress;
  const sample = (keys: SceneKeyframe[], at: number): SceneKeyframe => {
    if (at <= keys[0]!.at) return keys[0]!;
    const right = keys.findIndex((k) => k.at >= at);
    if (right < 0) return keys[keys.length - 1]!;
    const a = keys[right - 1]!,
      b = keys[right]!,
      u = (at - a.at) / (b.at - a.at);
    return {
      at,
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
      scale: a.scale + (b.scale - a.scale) * u,
      opacity: a.opacity + (b.opacity - a.opacity) * u,
      reveal: a.reveal + (b.reveal - a.reveal) * u,
    };
  };
  return scene.layers.map((layer) => {
    if (!layer.keyframes.length)
      return {
        id: layer.id,
        x: layer.x,
        y: layer.y,
        scale: 1,
        opacity: layer.opacity,
        reveal: 1,
      };
    const live = sample(layer.keyframes, t),
      still = sample(layer.keyframes, scene.staticProgress);
    const blend = (key: "x" | "y" | "scale" | "opacity" | "reveal") =>
      still[key] + (live[key] - still[key]) * scene.motionStrength;
    return {
      id: layer.id,
      x: blend("x"),
      y: blend("y"),
      scale: blend("scale"),
      opacity: blend("opacity") * layer.opacity,
      reveal: blend("reveal"),
    };
  });
}

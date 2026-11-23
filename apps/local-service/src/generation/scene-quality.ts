import { createRequire } from "node:module";
import {
  sceneFrame,
  sceneViewport,
  type SceneDefinition,
} from "@earth-stories/story-schema";
export type SceneQualityIssue = {
  code: "invisible-motion" | "cropped-motion";
  message: string;
};
/** Conservative bounds catch missing motion, not artistic quality. Existing projects are never rewritten. */
export function inspectSceneQuality(
  scene: SceneDefinition,
  immersive = true,
): SceneQualityIssue[] {
  if (scene.motionStrength === 0) return [];
  const moving = scene.layers.flatMap((l, index) =>
    l.kind === "path" &&
    l.keyframes.some((k) => {
      const first = l.keyframes[0]!;
      return (
        Math.abs(k.x - first.x) > 0.02 ||
        Math.abs(k.y - first.y) > 0.02 ||
        Math.abs(k.scale - first.scale) > 0.05 ||
        Math.abs((k.rotation ?? 0) - (first.rotation ?? 0)) > 5 ||
        Math.abs(k.reveal - first.reveal) > 0.1
      );
    })
      ? [index]
      : [],
  );
  if (!moving.length) return [];
  // Keep the native decoder lazy: service startup and non-generation routes
  // must not require raster/vector inspection dependencies.
  const { Path2D } = createRequire(import.meta.url)(
    "@napi-rs/canvas",
  ) as typeof import("@napi-rs/canvas");
  const bounds = new Map(
    moving.map((i) => [
      i,
      new Path2D(
        (
          scene.layers[i] as Extract<
            SceneDefinition["layers"][number],
            { kind: "path" }
          >
        ).pathData,
      ).computeTightBounds(),
    ]),
  );
  const visibleSamples = (ratio: number) => {
    const view = sceneViewport(
      scene,
      immersive ? ratio : scene.width / scene.height,
    );
    return [0, 0.25, 0.5, 0.75, 1].filter((t) => {
      const frames = sceneFrame(scene, t);
      return moving.some((i) => {
        const layer = scene.layers[i]!,
          frame = frames[i]!,
          b = bounds.get(i)!;
        if (
          frame.opacity < 0.05 ||
          frame.reveal <= 0 ||
          (layer.kind === "path" &&
            !layer.fillRole &&
            (!layer.strokeRole || layer.strokeWidth === 0))
        )
          return false;
        const stroke = layer.kind === "path" ? layer.strokeWidth / 2 : 0;
        const left = Math.max(0, b[0] - stroke),
          top = Math.max(0, b[1] - stroke),
          right = Math.min(frame.reveal, b[2] + stroke),
          bottom = Math.min(1, b[3] + stroke);
        if (right <= left || bottom <= top) return false;
        const w = layer.width * scene.width,
          h = layer.height * scene.height;
        const r = ((frame.rotation ?? 0) * Math.PI) / 180,
          cos = Math.cos(r),
          sin = Math.sin(r);
        const points = [
          [left, top],
          [right, top],
          [right, bottom],
          [left, bottom],
        ].map(([x, y]) => {
          const dx = x! * w - w / 2,
            dy = y! * h - h / 2;
          return {
            x:
              frame.x * scene.width +
              frame.scale * (w / 2 + dx * cos - dy * sin),
            y:
              frame.y * scene.height +
              frame.scale * (h / 2 + dx * sin + dy * cos),
          };
        });
        const x1 = Math.max(view.x, Math.min(...points.map((p) => p.x))),
          x2 = Math.min(
            view.x + view.width,
            Math.max(...points.map((p) => p.x)),
          );
        const y1 = Math.max(view.y, Math.min(...points.map((p) => p.y))),
          y2 = Math.min(
            view.y + view.height,
            Math.max(...points.map((p) => p.y)),
          );
        return (
          (Math.max(0, x2 - x1) * Math.max(0, y2 - y1)) /
            (view.width * view.height) >
          0.001
        );
      });
    }).length;
  };
  if (visibleSamples(1440 / 800) < 2)
    return [
      {
        code: "invisible-motion",
        message:
          "The moving illustration is outside the visible scene or too small/transparent to follow. Use absolute keyframe positions and keep meaningful movement visible.",
      },
    ];
  if (immersive && visibleSamples(390 / 800) < 2)
    return [
      {
        code: "cropped-motion",
        message:
          "Some motion may be cropped on narrow screens. Review the mobile composition and focal point.",
      },
    ];
  return [];
}

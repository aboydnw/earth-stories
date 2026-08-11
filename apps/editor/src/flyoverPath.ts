import type { Camera, FlyoverKeyframe } from "@earth-stories/story-schema";

export function normalizeBearing(value: number) {
  return ((value % 360) + 360) % 360;
}

export function captureKeyframe(camera: Camera, caption = ""): FlyoverKeyframe {
  return {
    ...camera,
    center: [...camera.center],
    terrain: camera.terrain ? { ...camera.terrain } : undefined,
    bearing: normalizeBearing(camera.bearing),
    caption,
  };
}

export function recaptureKeyframe(keyframe: FlyoverKeyframe, camera: Camera) {
  return captureKeyframe(camera, keyframe.caption);
}

export function reorderKeyframe(
  keyframes: FlyoverKeyframe[],
  from: number,
  to: number,
) {
  const next = [...keyframes];
  if (
    from < 0 ||
    from >= next.length ||
    to < 0 ||
    to >= next.length ||
    from === to
  )
    return next;
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  return next;
}

export function createOrbitPreset(camera: Camera, segments = 4) {
  const safeSegments = Math.max(2, Math.round(segments));
  return Array.from({ length: safeSegments + 1 }, (_, index) =>
    captureKeyframe({
      ...camera,
      bearing: normalizeBearing(camera.bearing + (360 / safeSegments) * index),
    }),
  );
}

export function createApproachPreset(camera: Camera) {
  return [
    captureKeyframe({ ...camera, zoom: Math.max(0, camera.zoom - 2) }),
    captureKeyframe(camera),
  ];
}

export function flyoverWarnings(keyframes: FlyoverKeyframe[]) {
  const warnings: string[] = [];
  for (let index = 1; index < keyframes.length; index += 1) {
    const from = keyframes[index - 1]!;
    const to = keyframes[index]!;
    const zoomJump = Math.abs(to.zoom - from.zoom);
    if (zoomJump > 3)
      warnings.push(
        `Keyframes ${index} and ${index + 1} jump ${zoomJump.toFixed(1)} zoom levels.`,
      );
  }
  return warnings;
}

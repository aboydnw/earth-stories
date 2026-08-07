import type { Camera } from "@earth-stories/story-schema";

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount;

function sample(values: number[], index: number) {
  if (index < 0) return 2 * values[0]! - values[1]!;
  if (index >= values.length) return 2 * values.at(-1)! - values.at(-2)!;
  return values[index]!;
}

export function catmullRom(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  amount: number,
) {
  const squared = amount * amount;
  const cubed = squared * amount;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * amount +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * squared +
      (-p0 + 3 * p1 - 3 * p2 + p3) * cubed)
  );
}

export function shortestBearing(from: number, to: number, amount: number) {
  const delta = ((to - from + 540) % 360) - 180;
  return (((from + delta * amount) % 360) + 360) % 360;
}

export function unwrapLongitudes(values: number[]) {
  const result: number[] = [];
  for (const longitude of values) {
    let next = longitude;
    const previous = result.at(-1);
    if (previous !== undefined) {
      while (next - previous > 180) next -= 360;
      while (next - previous < -180) next += 360;
    }
    result.push(next);
  }
  return result;
}

export function interpolateFlyover(
  keyframes: Camera[],
  progress: number,
): Camera | null {
  if (keyframes.length < 2) return null;
  const position = clamp(progress) * (keyframes.length - 1);
  const index = Math.min(keyframes.length - 2, Math.floor(position));
  const amount = position - index;
  const from = keyframes[index]!;
  const to = keyframes[index + 1]!;
  const longitudes = unwrapLongitudes(
    keyframes.map((frame) => frame.center[0]),
  );
  const latitudes = keyframes.map((frame) => frame.center[1]);
  return {
    ...from,
    center: [
      catmullRom(
        sample(longitudes, index - 1),
        sample(longitudes, index),
        sample(longitudes, index + 1),
        sample(longitudes, index + 2),
        amount,
      ),
      catmullRom(
        sample(latitudes, index - 1),
        sample(latitudes, index),
        sample(latitudes, index + 1),
        sample(latitudes, index + 2),
        amount,
      ),
    ],
    zoom: lerp(from.zoom, to.zoom, amount),
    pitch: lerp(from.pitch, to.pitch, amount),
    bearing: shortestBearing(from.bearing, to.bearing, amount),
  };
}

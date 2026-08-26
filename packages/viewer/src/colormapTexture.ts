import { Colormap } from "@developmentseed/deck.gl-raster/gpu-modules";
import type { Device, Texture } from "@luma.gl/core";
import { colormapStops, type ColormapName } from "@earth-stories/story-schema";

export type { ColormapName };

export function buildColormapLut(
  name: ColormapName,
  reversed: boolean,
  options?: { alphaRamp?: boolean },
) {
  const stops = colormapStops(name, reversed);
  const lut = new Uint8Array(256 * 4);
  for (let index = 0; index < 256; index += 1) {
    const position = index / 255;
    const segment = Math.min(
      stops.length - 2,
      Math.floor(position * (stops.length - 1)),
    );
    const local = position * (stops.length - 1) - segment;
    for (let channel = 0; channel < 3; channel += 1) {
      lut[index * 4 + channel] = Math.round(
        (stops[segment]![channel]! * (1 - local) +
          stops[segment + 1]![channel]! * local) *
          255,
      );
    }
    lut[index * 4 + 3] =
      index === 0
        ? 0
        : options?.alphaRamp
          ? Math.round(255 * Math.min(1, (index - 1) / 101))
          : 255;
  }
  return lut;
}

export function createColormapTexture(
  device: Device,
  name: ColormapName,
  reversed: boolean,
  options?: { filter?: "linear" | "nearest"; alphaRamp?: boolean },
) {
  const filter = options?.filter ?? "linear";
  return device.createTexture({
    dimension: "2d-array",
    data: buildColormapLut(name, reversed, options),
    format: "rgba8unorm",
    width: 256,
    height: 1,
    depth: 1,
    mipLevels: 1,
    sampler: {
      minFilter: filter,
      magFilter: filter,
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      addressModeW: "clamp-to-edge",
    },
  }) as Texture;
}

export { Colormap };

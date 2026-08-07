import { Colormap } from "@developmentseed/deck.gl-raster/gpu-modules";
import type { Device, Texture } from "@luma.gl/core";

const ramps = {
  viridis: [
    [0.267, 0.004, 0.329],
    [0.128, 0.567, 0.551],
    [0.993, 0.906, 0.144],
  ],
  magma: [
    [0.001, 0, 0.014],
    [0.716, 0.215, 0.475],
    [0.987, 0.991, 0.75],
  ],
  terrain: [
    [0.122, 0.467, 0.706],
    [0.498, 0.788, 0.498],
    [0.96, 0.96, 0.86],
  ],
  grayscale: [
    [0.08, 0.08, 0.08],
    [0.5, 0.5, 0.5],
    [0.96, 0.96, 0.96],
  ],
} as const;

export type ColormapName = keyof typeof ramps;

export function buildColormapLut(name: ColormapName) {
  const stops = ramps[name];
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
    lut[index * 4 + 3] = index === 0 ? 0 : 255;
  }
  return lut;
}

export function createColormapTexture(
  device: Device,
  name: ColormapName,
  filter: "linear" | "nearest" = "linear",
) {
  return device.createTexture({
    dimension: "2d-array",
    data: buildColormapLut(name),
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

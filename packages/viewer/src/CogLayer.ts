import type { Layer } from "@deck.gl/core";
import { COGLayer } from "@developmentseed/deck.gl-geotiff";
import { CreateTexture } from "@developmentseed/deck.gl-raster/gpu-modules";
import type { PublicationAsset } from "@earth-stories/story-schema";

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

function colorize(name: keyof typeof ramps) {
  const [low, middle, high] = ramps[name];
  return {
    name: `earth-stories-${name}`,
    inject: {
      "fs:DECKGL_FILTER_COLOR": `
        float value = color.r;
        vec3 low = vec3(${low.join(",")});
        vec3 middle = vec3(${middle.join(",")});
        vec3 high = vec3(${high.join(",")});
        vec3 mapped = value < 0.5
          ? mix(low, middle, value * 2.0)
          : mix(middle, high, (value - 0.5) * 2.0);
        color = vec4(mapped, value <= 0.0 ? 0.0 : 1.0);
      `,
    },
  };
}

export function buildCogLayers(
  asset: PublicationAsset,
  url: string,
  onError: (message: string) => void,
): Layer[] {
  const { presentation } = asset;
  if (!presentation.rescale)
    return [
      new COGLayer({
        id: `${asset.id}-cog`,
        geotiff: url,
        opacity: presentation.opacity,
        maxError: 0.03,
        onError: (cause: unknown) =>
          onError(
            cause instanceof Error
              ? cause.message
              : "The COG could not be rendered.",
          ),
      }),
    ];

  const [minimum, maximum] = presentation.rescale;
  const range = maximum - minimum || 1;
  const getTileData = async (
    image: {
      fetchTile: (
        x: number,
        y: number,
        options: { boundless: boolean; signal: AbortSignal },
      ) => Promise<{
        array: {
          layout: string;
          bands: ArrayLike<number>[];
          data: ArrayLike<number>;
          width: number;
          height: number;
        };
      }>;
    },
    options: {
      device: { createTexture: (options: unknown) => unknown };
      x: number;
      y: number;
      signal: AbortSignal;
    },
  ) => {
    const tile = await image.fetchTile(options.x, options.y, {
      boundless: false,
      signal: options.signal,
    });
    const { width, height } = tile.array;
    const bandIndex = Math.max(0, presentation.rasterBand - 1);
    const source =
      tile.array.layout === "band-separate"
        ? (tile.array.bands[bandIndex] ?? tile.array.bands[0]!)
        : tile.array.data;
    const normalized = new Uint8Array(width * height);
    for (let index = 0; index < normalized.length; index += 1) {
      const value = Number(source[index]);
      normalized[index] = Number.isFinite(value)
        ? Math.round(
            Math.max(0, Math.min(255, ((value - minimum) / range) * 255)),
          )
        : 0;
    }
    return {
      texture: options.device.createTexture({
        data: normalized,
        format: "r8unorm",
        width,
        height,
      }),
      width,
      height,
    };
  };
  const renderTile = (data: { texture: unknown }) => ({
    renderPipeline: [
      { module: CreateTexture, props: { textureName: data.texture } },
      { module: colorize(presentation.colormap) },
    ],
  });
  return [
    new COGLayer({
      id: `${asset.id}-cog`,
      geotiff: url,
      opacity: presentation.opacity,
      getTileData,
      renderTile,
      maxError: 0.03,
      onError: (cause: unknown) =>
        onError(
          cause instanceof Error
            ? cause.message
            : "The COG could not be rendered.",
        ),
    } as never),
  ];
}

import type { Layer } from "@deck.gl/core";
import { COGLayer, type COGLayerProps } from "@developmentseed/deck.gl-geotiff";
import { CreateTexture } from "@developmentseed/deck.gl-raster/gpu-modules";
import type { Texture } from "@luma.gl/core";
import type { PublicationAsset } from "@earth-stories/story-schema";
import type { GeoTIFF } from "@developmentseed/geotiff";

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

function shaderColor(hex: string) {
  return [1, 3, 5].map(
    (offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
}

function shaderFloat(value: number) {
  if (!Number.isFinite(value)) return "0.0";
  const literal = String(value);
  return /[.eE]/.test(literal) ? literal : `${literal}.0`;
}

function shaderVector(values: readonly number[]) {
  return values.map(shaderFloat).join(",");
}

export function colorize(
  name: keyof typeof ramps,
  categoryColors: Record<string, string> = {},
  rescale: [number, number] | null = null,
) {
  const [low, middle, high] = ramps[name];
  const categoryShader = rescale
    ? Object.entries(categoryColors)
        .flatMap(([raw, hex]) => {
          const value = Number(raw);
          return Number.isFinite(value)
            ? [
                `if (abs(rawValue - ${shaderFloat(value)}) < 0.00001) mapped = vec3(${shaderVector(shaderColor(hex))});`,
              ]
            : [];
        })
        .join("\n")
    : "";
  const [minimum, maximum] = rescale ?? [0, 1];
  return {
    name: `earth-stories-${name}`,
    inject: {
      "fs:DECKGL_FILTER_COLOR": `
        float encoded = color.r;
        float value = max(0.0, (encoded * 255.0 - 1.0) / 254.0);
        vec3 low = vec3(${shaderVector(low)});
        vec3 middle = vec3(${shaderVector(middle)});
        vec3 high = vec3(${shaderVector(high)});
        vec3 mapped = value < 0.5
          ? mix(low, middle, value * 2.0)
          : mix(middle, high, (value - 0.5) * 2.0);
        float rawValue = ${shaderFloat(minimum)} + value * ${shaderFloat(maximum - minimum || 1)};
        ${categoryShader}
        color = vec4(mapped, encoded <= 0.0 ? 0.0 : 1.0);
      `,
    },
  };
}

export function buildCogLayers(
  asset: PublicationAsset,
  source: GeoTIFF | string,
  onError: (message: string) => void,
  rescale: [number, number] | null = asset.presentation.rescale,
): Layer[] {
  const { presentation } = asset;
  if (!rescale)
    return [
      new COGLayer({
        id: `${asset.id}-cog`,
        geotiff: source,
        opacity: presentation.opacity,
        maxError: 0.03,
      }),
    ];

  const [minimum, maximum] = rescale;
  const range = maximum - minimum || 1;
  type CogTile = { texture: Texture; width: number; height: number };
  const getTileData: COGLayerProps<CogTile>["getTileData"] = async (
    image,
    options,
  ) => {
    try {
      const tile = await image.fetchTile(options.x, options.y, {
        boundless: false,
        signal: options.signal ?? new AbortController().signal,
      });
      const { width, height } = tile.array;
      const bandIndex = Math.max(0, presentation.rasterBand - 1);
      const bandCount = Math.max(1, tile.array.count);
      const source =
        tile.array.layout === "band-separate"
          ? (tile.array.bands[bandIndex] ?? tile.array.bands[0]!)
          : tile.array.data;
      const normalized = new Uint8Array(width * height);
      for (let index = 0; index < normalized.length; index += 1) {
        const sourceIndex =
          tile.array.layout === "band-separate"
            ? index
            : index * bandCount + Math.min(bandIndex, bandCount - 1);
        const value = Number(source[sourceIndex]);
        const valid =
          Number.isFinite(value) &&
          (tile.array.mask === null || tile.array.mask[index] !== 0) &&
          (tile.array.nodata === null || value !== tile.array.nodata);
        normalized[index] = valid
          ? 1 +
            Math.round(
              Math.max(0, Math.min(254, ((value - minimum) / range) * 254)),
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
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === "AbortError"))
        onError(
          cause instanceof Error
            ? cause.message
            : "The COG tile could not be read.",
        );
      throw cause;
    }
  };
  const renderTile: COGLayerProps<CogTile>["renderTile"] = (data) => ({
    renderPipeline: [
      { module: CreateTexture, props: { textureName: data.texture } },
      {
        module: colorize(
          presentation.colormap,
          presentation.categoryColors,
          rescale,
        ),
      },
    ],
  });
  return [
    new COGLayer({
      id: `${asset.id}-cog`,
      geotiff: source,
      opacity: presentation.opacity,
      getTileData,
      renderTile,
      maxError: 0.03,
    }),
  ];
}

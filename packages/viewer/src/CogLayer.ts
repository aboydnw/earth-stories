import type { Layer } from "@deck.gl/core";
import { COGLayer, type COGLayerProps } from "@developmentseed/deck.gl-geotiff";
import { CreateTexture } from "@developmentseed/deck.gl-raster/gpu-modules";
import type { Texture } from "@luma.gl/core";
import type { PublicationAsset } from "@earth-stories/story-schema";
import type { GeoTIFF } from "@developmentseed/geotiff";
import { resolveCogLayerProjection } from "./cogProjection.js";
import { colormapStops, type ColormapName } from "@earth-stories/story-schema";

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
  name: ColormapName,
  reversed = false,
  categoryColors: Record<string, string> = {},
  rescale: [number, number] | null = null,
) {
  const stops = colormapStops(name, reversed);
  const segments = stops.length - 1;
  const rampShader = stops
    .slice(0, -1)
    .map((stop, index) => {
      const next = stops[index + 1]!;
      const start = index / segments;
      return `if (value >= ${shaderFloat(start)}) mapped = mix(vec3(${shaderVector(stop)}), vec3(${shaderVector(next)}), clamp((value - ${shaderFloat(start)}) * ${shaderFloat(segments)}, 0.0, 1.0));`;
    })
    .join("\n");
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
    name: `earth-stories-${name}${reversed ? "-reversed" : ""}`,
    inject: {
      "fs:DECKGL_FILTER_COLOR": `
        float encoded = color.r;
        float value = max(0.0, (encoded * 255.0 - 1.0) / 254.0);
        vec3 mapped = vec3(0.0);
        ${rampShader}
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
  onGeoTiffLoad?: () => void,
  projectionDefinitions: Array<{ epsg: number; definition: string }> = [],
  offline = false,
): Layer[] {
  const { presentation } = asset;
  const resolveAssetEpsg = (epsg: number) =>
    resolveCogLayerProjection(
      epsg,
      asset.cog,
      undefined,
      projectionDefinitions,
      offline,
    );
  if (!rescale)
    return [
      new COGLayer({
        id: `${asset.id}-cog`,
        geotiff: source,
        epsgResolver: resolveAssetEpsg,
        onGeoTIFFLoad: onGeoTiffLoad,
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
          presentation.colormapReversed,
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
      epsgResolver: resolveAssetEpsg,
      onGeoTIFFLoad: onGeoTiffLoad,
      opacity: presentation.opacity,
      getTileData,
      renderTile,
      maxError: 0.03,
    }),
  ];
}

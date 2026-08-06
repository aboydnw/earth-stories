import { useEffect, useMemo, useState } from "react";
import { ZarrLayer, type SliceInput } from "@developmentseed/deck.gl-zarr";
import { CreateTexture } from "@developmentseed/deck.gl-raster/gpu-modules";
import type { Texture } from "@luma.gl/core";
import * as zarr from "zarrita";
import type { PublicationAsset } from "@earth-stories/story-schema";
import { colorize } from "./CogLayer.js";
import { DeckOverlay } from "./DeckOverlay.js";

export function ZarrOverlay({
  asset,
  onError,
}: {
  asset: PublicationAsset;
  onError: (message: string) => void;
}) {
  const [node, setNode] = useState<
    zarr.Group<zarr.Readable> | zarr.Array<zarr.DataType, zarr.Readable> | null
  >(null);
  const [timeIndex, setTimeIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(
    () => setTimeIndex(0),
    [asset.id, asset.href, asset.zarr?.timesteps.length],
  );
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const store = await zarr.withMaybeConsolidatedMetadata(
          new zarr.FetchStore(asset.href),
        );
        const root = await zarr.open(store);
        if (active) setNode(root);
      } catch (cause) {
        if (active)
          onError(
            cause instanceof Error
              ? cause.message
              : "The Zarr store could not be opened.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [asset.href, onError]);
  useEffect(() => {
    if (!playing || !asset.zarr || asset.zarr.timesteps.length < 2) return;
    const timer = window.setInterval(
      () =>
        setTimeIndex((current) =>
          current + 1 >= asset.zarr!.timesteps.length ? 0 : current + 1,
        ),
      650,
    );
    return () => window.clearInterval(timer);
  }, [asset.zarr, playing]);
  const layers = useMemo(() => {
    if (!node || !asset.zarr) return [];
    const selection: Record<string, SliceInput> = { ...asset.zarr.selection };
    const timestep = asset.zarr.timesteps[timeIndex];
    if (asset.zarr.timeDimension && timestep)
      selection[asset.zarr.timeDimension] = timestep.index;
    const [minimum, maximum] = asset.presentation.rescale ?? [0, 1];
    const range = maximum - minimum || 1;
    return [
      new ZarrLayer({
        id: `${asset.id}-zarr-${timeIndex}`,
        node,
        variable: asset.zarr.variable,
        selection,
        opacity: asset.presentation.opacity,
        metadata: asset.zarr.geozarr
          ? {
              "spatial:dimensions": asset.zarr.geozarr.dimensions,
              "spatial:transform": asset.zarr.geozarr.transform,
              "spatial:shape": asset.zarr.geozarr.shape,
              "proj:code": asset.zarr.geozarr.crs,
            }
          : undefined,
        getTileData: async (array, options) => {
          const chunk = (await zarr.get(array, options.sliceSpec)) as {
            data: ArrayLike<number>;
          };
          const normalized = new Uint8Array(options.width * options.height);
          for (let index = 0; index < normalized.length; index += 1) {
            const value = Number(chunk.data[index]);
            normalized[index] = Number.isFinite(value)
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
              width: options.width,
              height: options.height,
            }) as Texture,
            width: options.width,
            height: options.height,
          };
        },
        renderTile: (data) => ({
          renderPipeline: [
            { module: CreateTexture, props: { textureName: data.texture } },
            {
              module: colorize(
                asset.presentation.colormap,
                asset.presentation.categoryColors,
                asset.presentation.rescale,
              ),
            },
          ],
        }),
        onError: (cause: unknown) =>
          onError(
            cause instanceof Error
              ? cause.message
              : "The Zarr layer could not be rendered.",
          ),
      }),
    ];
  }, [asset, node, onError, timeIndex]);
  return (
    <>
      <DeckOverlay layers={layers} />
      {asset.zarr && asset.zarr.timesteps.length > 1 ? (
        <div className="story-map__time">
          <label>
            Time: {asset.zarr.timesteps[timeIndex]?.label}
            <input
              type="range"
              min="0"
              max={asset.zarr.timesteps.length - 1}
              value={timeIndex}
              onChange={(event) => setTimeIndex(Number(event.target.value))}
            />
          </label>
          <button type="button" onClick={() => setPlaying((value) => !value)}>
            {playing ? "Pause" : "Play"}
          </button>
        </div>
      ) : null}
    </>
  );
}

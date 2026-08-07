import { useEffect, useMemo, useState } from "react";
import { ZarrLayer, type SliceInput } from "@developmentseed/deck.gl-zarr";
import { CreateTexture } from "@developmentseed/deck.gl-raster/gpu-modules";
import type { Texture } from "@luma.gl/core";
import * as zarr from "zarrita";
import { useMap } from "react-map-gl/maplibre";
import type { PublicationAsset } from "@earth-stories/story-schema";
import { colorize } from "./CogLayer.js";
import { DeckOverlay } from "./DeckOverlay.js";
import {
  completeZarrSelection,
  openZarrVariable,
  type OpenedZarrNode,
} from "./zarrNode.js";
import { timestepIndex } from "./temporal.js";

export function ZarrOverlay({
  asset,
  onError,
  onReady,
  position,
}: {
  asset: PublicationAsset;
  onError: (message: string) => void;
  onReady?: () => void;
  position: number;
}) {
  const maps = useMap();
  const [targetWidth, setTargetWidth] = useState(512);
  const [opened, setOpened] = useState<OpenedZarrNode | null>(null);
  useEffect(() => {
    const map = maps.current?.getMap();
    if (!map) return;
    const updateTarget = () =>
      setTargetWidth(
        Math.min(8192, Math.max(512, 256 * 2 ** Math.floor(map.getZoom()))),
      );
    updateTarget();
    map.on("zoomend", updateTarget);
    return () => {
      map.off("zoomend", updateTarget);
    };
  }, [maps]);
  useEffect(() => {
    let active = true;
    setOpened(null);
    (async () => {
      try {
        const result = await openZarrVariable(
          asset.href,
          asset.zarr?.variable ?? "",
          targetWidth,
        );
        if (active) {
          setOpened(result);
          onReady?.();
        }
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
  }, [asset.href, asset.zarr?.variable, onError, onReady, targetWidth]);
  const timeIndex = timestepIndex(position, asset.zarr?.timesteps.length ?? 0);
  const layers = useMemo(() => {
    if (!opened || !asset.zarr) return [];
    const spatialDimensions =
      (opened.metadata?.["spatial:dimensions"] as string[] | undefined) ??
      asset.zarr.geozarr?.dimensions ??
      [];
    const timestep = asset.zarr.timesteps[timeIndex];
    const selection: Record<string, SliceInput> = completeZarrSelection(
      asset.zarr.selection,
      opened.dimensions ?? [],
      spatialDimensions,
      asset.zarr.timeDimension,
      timestep?.index ?? 0,
    );
    const [minimum, maximum] = asset.presentation.rescale ?? [0, 1];
    const range = maximum - minimum || 1;
    return [
      new ZarrLayer({
        id: `${asset.id}-zarr`,
        node: opened.node,
        variable: opened.variable,
        selection,
        opacity: asset.presentation.opacity,
        metadata:
          opened.metadata ??
          (asset.zarr.geozarr
            ? {
                "spatial:dimensions": asset.zarr.geozarr.dimensions,
                "spatial:transform": asset.zarr.geozarr.transform,
                "spatial:shape": asset.zarr.geozarr.shape,
                "proj:code": asset.zarr.geozarr.crs,
              }
            : undefined),
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
  }, [asset, opened, onError, timeIndex]);
  return <DeckOverlay layers={layers} />;
}

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicationAsset } from "@earth-stories/story-schema";
import { GeoTIFF } from "@developmentseed/geotiff";
import {
  epsgResolver,
  parseWkt,
  type ProjectionDefinition,
} from "@developmentseed/proj";
import proj4 from "proj4";
import { useMap } from "react-map-gl/maplibre";
import { buildCogLayers } from "./CogLayer.js";
import { deriveCogRescale, supportsInferredPipeline } from "./cogPipeline.js";
import { DeckOverlay } from "./DeckOverlay.js";

export function CogOverlay({
  asset,
  url,
  onError,
  onBounds,
  onReady,
}: {
  asset: PublicationAsset;
  url: string;
  onError: (message: string) => void;
  onBounds?: (bounds: [number, number, number, number]) => void;
  onReady?: () => void;
}) {
  const maps = useMap();
  const raster = useRef<{
    geotiff: GeoTIFF;
    projection: ProjectionDefinition;
  } | null>(null);
  const [inspection, setInspection] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<{
    key: string;
    source: GeoTIFF;
    rescale: [number, number] | null;
  } | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onBoundsRef = useRef(onBounds);
  onBoundsRef.current = onBounds;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [rescaleMin, rescaleMax] = asset.presentation.rescale ?? [null, null];
  const preparedKey = `${url}|${asset.presentation.rasterBand}|${rescaleMin}|${rescaleMax}`;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const absoluteUrl = new URL(url, window.location.href).toString();
        const source = await GeoTIFF.fromUrl(absoluteUrl);
        const crs = source.crs;
        const projection = (
          typeof crs === "number" ? await epsgResolver(crs) : parseWkt(crs)
        ) as ProjectionDefinition;
        let rescale: [number, number] | null =
          rescaleMin !== null && rescaleMax !== null
            ? [rescaleMin, rescaleMax]
            : null;
        if (!rescale && !supportsInferredPipeline(source)) {
          rescale = await deriveCogRescale(
            source,
            asset.presentation.rasterBand,
          );
        }
        if (cancelled) return;
        raster.current = { geotiff: source, projection };
        const projectionName = `EARTH_STORIES:${asset.id}`;
        proj4.defs(projectionName, projection as never);
        const [minX, minY, maxX, maxY] = source.bbox;
        const corners = (
          [
            [minX, minY],
            [maxX, minY],
            [maxX, maxY],
            [minX, maxY],
          ] as Array<[number, number]>
        ).map(
          (corner) =>
            proj4(projectionName, "EPSG:4326", corner) as [number, number],
        );
        const lons = corners.map((corner) => corner[0]);
        const lats = corners.map((corner) => corner[1]);
        onBoundsRef.current?.([
          Math.min(...lons),
          Math.min(...lats),
          Math.max(...lons),
          Math.max(...lats),
        ]);
        onReadyRef.current?.();
        setPrepared({ key: preparedKey, source, rescale });
      } catch (cause) {
        if (!cancelled)
          onErrorRef.current(
            cause instanceof Error
              ? cause.message
              : "The COG could not be opened.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
    // preparedKey encodes every input that should trigger a re-open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preparedKey]);
  const layers = useMemo(
    () =>
      prepared?.key === preparedKey
        ? buildCogLayers(asset, prepared.source, onError, prepared.rescale)
        : [],
    [asset, onError, prepared, preparedKey],
  );
  useEffect(() => {
    const map = maps.current?.getMap();
    if (!map) return;
    const inspect = async (event: { lngLat: { lng: number; lat: number } }) => {
      const current = raster.current;
      if (!current) return;
      try {
        const projectionName = `EARTH_STORIES:${asset.id}`;
        proj4.defs(projectionName, current.projection as never);
        const [x, y] = proj4("EPSG:4326", projectionName, [
          event.lngLat.lng,
          event.lngLat.lat,
        ]);
        const [row, column] = current.geotiff.index(x, y);
        if (
          row < 0 ||
          column < 0 ||
          row >= current.geotiff.height ||
          column >= current.geotiff.width
        ) {
          setInspection(null);
          return;
        }
        const tileX = Math.floor(column / current.geotiff.tileWidth);
        const tileY = Math.floor(row / current.geotiff.tileHeight);
        const tile = await current.geotiff.fetchTile(tileX, tileY, {
          boundless: true,
        });
        const localColumn = column - tileX * current.geotiff.tileWidth;
        const localRow = row - tileY * current.geotiff.tileHeight;
        const pixel = localRow * tile.array.width + localColumn;
        const band = Math.min(
          Math.max(0, asset.presentation.rasterBand - 1),
          Math.max(0, tile.array.count - 1),
        );
        const value =
          tile.array.layout === "band-separate"
            ? tile.array.bands[band]?.[pixel]
            : tile.array.data[pixel * tile.array.count + band];
        const valid =
          value !== undefined &&
          (tile.array.mask === null || tile.array.mask[pixel] !== 0) &&
          (tile.array.nodata === null || value !== tile.array.nodata);
        setInspection(
          `Band ${band + 1}: ${valid ? Number(value).toLocaleString() : "no data"}`,
        );
      } catch (cause) {
        onError(
          cause instanceof Error
            ? cause.message
            : "The raster pixel could not be inspected.",
        );
      }
    };
    map.on("click", inspect);
    return () => {
      map.off("click", inspect);
    };
  }, [asset.presentation.rasterBand, maps, onError]);
  return (
    <>
      <DeckOverlay layers={layers} />
      {inspection ? (
        <output className="story-map__pixel">{inspection}</output>
      ) : null}
    </>
  );
}

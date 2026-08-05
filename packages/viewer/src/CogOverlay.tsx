import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicationAsset } from "@earth-stories/story-schema";
import type { GeoTIFF } from "@developmentseed/geotiff";
import type { ProjectionDefinition } from "@developmentseed/proj";
import proj4 from "proj4";
import { useMap } from "react-map-gl/maplibre";
import { buildCogLayers } from "./CogLayer.js";
import { DeckOverlay } from "./DeckOverlay.js";

export function CogOverlay({
  asset,
  url,
  onError,
}: {
  asset: PublicationAsset;
  url: string;
  onError: (message: string) => void;
}) {
  const maps = useMap();
  const raster = useRef<{
    geotiff: GeoTIFF;
    projection: ProjectionDefinition;
  } | null>(null);
  const [inspection, setInspection] = useState<string | null>(null);
  const onLoad = useCallback(
    (geotiff: GeoTIFF, projection: ProjectionDefinition) => {
      raster.current = { geotiff, projection };
    },
    [],
  );
  const layers = useMemo(
    () => buildCogLayers(asset, url, onError, onLoad),
    [asset, onError, onLoad, url],
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
        setInspection(
          `Band ${band + 1}: ${value === undefined ? "no data" : Number(value).toLocaleString()}`,
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

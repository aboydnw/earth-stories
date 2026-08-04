import { useMemo, useState } from "react";
import Map, { Layer, Source } from "react-map-gl/maplibre";
import type {
  PublicationAsset,
  PublicationChapter,
} from "@earth-stories/story-schema";
import "maplibre-gl/dist/maplibre-gl.css";

interface MapChapterProps {
  chapter: Extract<PublicationChapter, { type: "map" | "scrolly" }>;
  asset: PublicationAsset;
  basemapStyle: string;
}

export function MapChapter({ chapter, asset, basemapStyle }: MapChapterProps) {
  const [ready, setReady] = useState(false);
  const initialViewState = useMemo(
    () => ({
      longitude: chapter.camera.center[0],
      latitude: chapter.camera.center[1],
      zoom: chapter.camera.zoom,
      bearing: chapter.camera.bearing,
      pitch: chapter.camera.pitch,
    }),
    [chapter.camera],
  );

  return (
    <div
      className="story-map"
      aria-label={`Map for ${chapter.title}`}
      data-map-ready={ready ? "true" : "false"}
    >
      <Map
        initialViewState={initialViewState}
        mapStyle={basemapStyle}
        preserveDrawingBuffer
        onIdle={() => setReady(true)}
      >
        {asset.kind === "geojson" ? (
          <Source id={asset.id} type="geojson" data={asset.href}>
            <Layer
              id={`${asset.id}-halo`}
              type="circle"
              paint={{
                "circle-radius": 11,
                "circle-color": "rgba(248, 246, 238, 0.8)",
              }}
            />
            <Layer
              id={`${asset.id}-points`}
              type="circle"
              paint={{
                "circle-radius": 6,
                "circle-color": "#dd4b1a",
                "circle-stroke-color": "#332b27",
                "circle-stroke-width": 1.5,
              }}
            />
          </Source>
        ) : null}
        {asset.kind === "xyz" ? (
          <Source
            id={asset.id}
            type="raster"
            tiles={[asset.href]}
            tileSize={256}
          >
            <Layer id={`${asset.id}-raster`} type="raster" />
          </Source>
        ) : null}
      </Map>
      <div className="story-map__label">{asset.label}</div>
      {asset.kind === "cog" ||
      asset.kind === "pmtiles" ||
      asset.kind === "geoparquet" ? (
        <a
          className="story-map__source"
          href={asset.href}
          target="_blank"
          rel="noreferrer"
        >
          Open connected {asset.kind.toUpperCase()} source
        </a>
      ) : null}
    </div>
  );
}

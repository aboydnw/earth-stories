import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import maplibregl from "maplibre-gl";
import Map, { Layer, Source } from "react-map-gl/maplibre";
import { PMTiles, Protocol } from "pmtiles";
import type {
  PublicationAsset,
  PublicationChapter,
} from "@earth-stories/story-schema";
import "maplibre-gl/dist/maplibre-gl.css";

const CogOverlay = lazy(async () => ({
  default: (await import("./CogOverlay.js")).CogOverlay,
}));

const GeoParquetOverlay = lazy(async () => ({
  default: (await import("./GeoParquetOverlay.js")).GeoParquetOverlay,
}));

interface MapChapterProps {
  chapter: Extract<PublicationChapter, { type: "map" | "scrolly" }>;
  asset: PublicationAsset;
  basemapStyle: string;
}

let protocol: Protocol | null = null;
function ensurePmtilesProtocol() {
  if (protocol) return;
  protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
}

function absoluteAssetUrl(href: string) {
  return /^https?:\/\//i.test(href)
    ? href
    : new URL(href, window.location.href).toString();
}

const hexOpacity = (hex: string, opacity: number) => {
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${alpha}`;
};

export function MapChapter({ chapter, asset, basemapStyle }: MapChapterProps) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pmtilesLayers, setPmtilesLayers] = useState<string[]>(() => {
    if (asset.kind === "pmtiles") ensurePmtilesProtocol();
    return [];
  });
  const reportError = useCallback((message: string) => setError(message), []);
  const presentation = asset.presentation;
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
  const assetUrl = useMemo(() => absoluteAssetUrl(asset.href), [asset.href]);
  const resolvedAsset = useMemo(
    () => ({ ...asset, href: assetUrl }),
    [asset, assetUrl],
  );
  useEffect(() => {
    if (asset.kind !== "pmtiles") return;
    ensurePmtilesProtocol();
    const archive = new PMTiles(assetUrl);
    archive
      .getMetadata()
      .then((rawMetadata) => {
        const metadata = rawMetadata as {
          vector_layers?: Array<{ id?: unknown }>;
        };
        const layers = Array.isArray(metadata.vector_layers)
          ? metadata.vector_layers
              .map((layer: { id?: unknown }) =>
                typeof layer === "object" &&
                layer !== null &&
                "id" in layer &&
                typeof layer.id === "string"
                  ? layer.id
                  : null,
              )
              .filter((id: string | null): id is string => Boolean(id))
          : [];
        setPmtilesLayers(layers);
      })
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "The PMTiles archive could not be opened.",
        ),
      );
  }, [asset.kind, assetUrl]);

  const vectorSourceLayers = presentation.sourceLayer
    ? [presentation.sourceLayer]
    : pmtilesLayers;

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
        onError={(event: { error: Error }) => setError(event.error.message)}
      >
        {asset.kind === "cog" ? (
          <Suspense fallback={null}>
            <CogOverlay asset={asset} url={assetUrl} onError={reportError} />
          </Suspense>
        ) : null}
        {asset.kind === "geoparquet" ? (
          <Suspense fallback={null}>
            <GeoParquetOverlay asset={resolvedAsset} onError={reportError} />
          </Suspense>
        ) : null}
        {asset.kind === "geojson" ? (
          <Source id={asset.id} type="geojson" data={asset.href}>
            <Layer
              id={`${asset.id}-fill`}
              type="fill"
              paint={{
                "fill-color": presentation.color,
                "fill-opacity": presentation.opacity * 0.45,
              }}
            />
            <Layer
              id={`${asset.id}-line`}
              type="line"
              paint={{
                "line-color": presentation.strokeColor,
                "line-opacity": presentation.opacity,
                "line-width": 2,
              }}
            />
            <Layer
              id={`${asset.id}-points`}
              type="circle"
              paint={{
                "circle-radius": presentation.radius,
                "circle-color": presentation.color,
                "circle-opacity": presentation.opacity,
                "circle-stroke-color": presentation.strokeColor,
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
            <Layer
              id={`${asset.id}-raster`}
              type="raster"
              paint={{ "raster-opacity": presentation.opacity }}
            />
          </Source>
        ) : null}
        {asset.kind === "pmtiles" && asset.tileType === "raster" ? (
          <Source id={asset.id} type="raster" url={`pmtiles://${assetUrl}`}>
            <Layer
              id={`${asset.id}-raster`}
              type="raster"
              paint={{ "raster-opacity": presentation.opacity }}
            />
          </Source>
        ) : null}
        {asset.kind === "pmtiles" && asset.tileType === "vector" ? (
          <Source id={asset.id} type="vector" url={`pmtiles://${assetUrl}`}>
            {vectorSourceLayers.flatMap((sourceLayer) => [
              <Layer
                key={`${sourceLayer}-fill`}
                id={`${asset.id}-${sourceLayer}-fill`}
                source-layer={sourceLayer}
                type="fill"
                paint={{
                  "fill-color": presentation.color,
                  "fill-opacity": presentation.opacity * 0.45,
                }}
              />,
              <Layer
                key={`${sourceLayer}-line`}
                id={`${asset.id}-${sourceLayer}-line`}
                source-layer={sourceLayer}
                type="line"
                paint={{
                  "line-color": presentation.strokeColor,
                  "line-opacity": presentation.opacity,
                  "line-width": 1.5,
                }}
              />,
              <Layer
                key={`${sourceLayer}-point`}
                id={`${asset.id}-${sourceLayer}-point`}
                source-layer={sourceLayer}
                type="circle"
                paint={{
                  "circle-radius": presentation.radius,
                  "circle-color": presentation.color,
                  "circle-opacity": presentation.opacity,
                  "circle-stroke-color": presentation.strokeColor,
                }}
              />,
            ])}
          </Source>
        ) : null}
      </Map>
      <div className="story-map__label">{asset.label}</div>
      {asset.attribution ? (
        <div className="story-map__attribution">{asset.attribution}</div>
      ) : null}
      {presentation.legendVisible ? (
        <aside className="story-map__legend" aria-label="Map legend">
          <span style={{ background: hexOpacity(presentation.color, 0.9) }} />
          {presentation.legendTitle || asset.label}
        </aside>
      ) : null}
      {error ? (
        <div className="story-map__error" role="alert">
          <strong>Map source unavailable</strong>
          <span>{error}</span>
          <a href={asset.href} target="_blank" rel="noreferrer">
            Open source
          </a>
        </div>
      ) : null}
    </div>
  );
}

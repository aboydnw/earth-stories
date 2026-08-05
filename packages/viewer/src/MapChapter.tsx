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
const CopcOverlay = lazy(async () => ({
  default: (await import("./CopcOverlay.js")).CopcOverlay,
}));
const ZarrOverlay = lazy(async () => ({
  default: (await import("./ZarrOverlay.js")).ZarrOverlay,
}));

interface MapChapterProps {
  chapter: Extract<PublicationChapter, { type: "map" | "scrolly" }>;
  asset: PublicationAsset | null;
  overlayAssets?: PublicationAsset[];
  basemapStyle: string;
  controlled?: boolean;
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

function AssetLayer({
  asset,
  onError,
}: {
  asset: PublicationAsset;
  onError: (message: string) => void;
}) {
  const [pmtilesLayers, setPmtilesLayers] = useState<string[]>([]);
  const [trajectory, setTrajectory] =
    useState<GeoJSON.FeatureCollection | null>(null);
  const [trajectoryProgress, setTrajectoryProgress] = useState(1);
  const presentation = asset.presentation;
  const assetUrl = useMemo(() => absoluteAssetUrl(asset.href), [asset.href]);
  useEffect(() => {
    let active = true;
    if (asset.kind === "pmtiles") {
      ensurePmtilesProtocol();
      const archive = new PMTiles(assetUrl);
      protocol?.add(archive);
      archive
        .getMetadata()
        .then((raw) => {
          const metadata = raw as { vector_layers?: Array<{ id?: unknown }> };
          if (active)
            setPmtilesLayers(
              (metadata.vector_layers ?? []).flatMap((layer) =>
                typeof layer.id === "string" ? [layer.id] : [],
              ),
            );
        })
        .catch((cause: unknown) =>
          onError(
            cause instanceof Error
              ? cause.message
              : "The PMTiles archive could not be opened.",
          ),
        );
    }
    if (asset.kind === "trajectory") {
      fetch(assetUrl)
        .then((response) => response.json())
        .then(
          (data: {
            tracks?: Array<{
              path?: [number, number][];
              timestamps?: number[];
            }>;
          }) => {
            if (!active) return;
            setTrajectory({
              type: "FeatureCollection",
              features: (data.tracks ?? []).map((track, index) => ({
                type: "Feature",
                id: index,
                properties: { timestamps: track.timestamps ?? [] },
                geometry: { type: "LineString", coordinates: track.path ?? [] },
              })),
            });
          },
        )
        .catch((cause: unknown) =>
          onError(
            cause instanceof Error
              ? cause.message
              : "The trajectory could not be opened.",
          ),
        );
    }
    return () => {
      active = false;
    };
  }, [asset.kind, assetUrl, onError]);
  const vectorSourceLayers = presentation.sourceLayer
    ? [presentation.sourceLayer]
    : pmtilesLayers;
  const resolvedAsset = { ...asset, href: assetUrl };
  const displayedTrajectory = useMemo(
    () =>
      trajectory
        ? {
            ...trajectory,
            features: trajectory.features.map((feature) => ({
              ...feature,
              geometry:
                feature.geometry.type === "LineString"
                  ? {
                      ...feature.geometry,
                      coordinates: feature.geometry.coordinates.slice(
                        0,
                        Math.max(
                          2,
                          Math.ceil(
                            feature.geometry.coordinates.length *
                              trajectoryProgress,
                          ),
                        ),
                      ),
                    }
                  : feature.geometry,
            })),
          }
        : null,
    [trajectory, trajectoryProgress],
  );
  if (asset.kind === "cog")
    return (
      <Suspense fallback={null}>
        <CogOverlay asset={asset} url={assetUrl} onError={onError} />
      </Suspense>
    );
  if (asset.kind === "geoparquet")
    return (
      <Suspense fallback={null}>
        <GeoParquetOverlay asset={resolvedAsset} onError={onError} />
      </Suspense>
    );
  if (asset.kind === "copc")
    return (
      <Suspense fallback={null}>
        <CopcOverlay asset={resolvedAsset} onError={onError} />
      </Suspense>
    );
  if (asset.kind === "zarr")
    return (
      <Suspense fallback={null}>
        <ZarrOverlay asset={resolvedAsset} onError={onError} />
      </Suspense>
    );
  if (
    asset.kind === "geojson" ||
    (asset.kind === "trajectory" && displayedTrajectory)
  ) {
    return (
      <>
        <Source
          id={asset.id}
          type="geojson"
          data={asset.kind === "trajectory" ? displayedTrajectory! : assetUrl}
        >
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
              "line-color": presentation.color,
              "line-opacity": presentation.opacity,
              "line-width": asset.kind === "trajectory" ? 4 : 2,
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
        {asset.kind === "trajectory" ? (
          <div className="story-map__time">
            <label>
              Journey: {Math.round(trajectoryProgress * 100)}%
              <input
                type="range"
                min="0.02"
                max="1"
                step="0.01"
                value={trajectoryProgress}
                onChange={(event) =>
                  setTrajectoryProgress(Number(event.target.value))
                }
              />
            </label>
          </div>
        ) : null}
      </>
    );
  }
  if (asset.kind === "xyz")
    return (
      <Source id={asset.id} type="raster" tiles={[assetUrl]} tileSize={256}>
        <Layer
          id={`${asset.id}-raster`}
          type="raster"
          paint={{ "raster-opacity": presentation.opacity }}
        />
      </Source>
    );
  if (asset.kind === "pmtiles" && asset.tileType === "raster")
    return (
      <Source id={asset.id} type="raster" url={`pmtiles://${assetUrl}`}>
        <Layer
          id={`${asset.id}-raster`}
          type="raster"
          paint={{ "raster-opacity": presentation.opacity }}
        />
      </Source>
    );
  if (asset.kind === "pmtiles" && asset.tileType === "vector")
    return (
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
    );
  return null;
}

export function MapChapter({
  chapter,
  asset,
  overlayAssets = [],
  basemapStyle,
  controlled = false,
}: MapChapterProps) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reportError = useCallback((message: string) => setError(message), []);
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
  const mapAssets = asset ? [asset, ...overlayAssets] : overlayAssets;

  return (
    <div
      className="story-map"
      aria-label={`Map for ${chapter.title}`}
      data-map-ready={ready ? "true" : "false"}
    >
      <Map
        {...(controlled
          ? { viewState: initialViewState }
          : { initialViewState })}
        mapStyle={basemapStyle}
        projection={chapter.camera.globe ? { type: "globe" } : undefined}
        terrain={
          chapter.camera.terrain?.enabled
            ? {
                source: "earth-stories-terrain",
                exaggeration: chapter.camera.terrain.exaggeration,
              }
            : undefined
        }
        preserveDrawingBuffer
        onIdle={() => setReady(true)}
        onError={(event: { error: Error }) => setError(event.error.message)}
      >
        {chapter.camera.terrain?.enabled ? (
          <Source
            id="earth-stories-terrain"
            type="raster-dem"
            tiles={[
              "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
            ]}
            tileSize={256}
            encoding="terrarium"
          />
        ) : null}
        {chapter.camera.buildings ? (
          <Layer
            id="earth-stories-buildings"
            source="carto"
            source-layer="building"
            type="fill-extrusion"
            minzoom={14}
            paint={{
              "fill-extrusion-color": "#d7cdc2",
              "fill-extrusion-height": [
                "coalesce",
                ["get", "render_height"],
                ["get", "height"],
                8,
              ],
              "fill-extrusion-base": [
                "coalesce",
                ["get", "render_min_height"],
                0,
              ],
              "fill-extrusion-opacity": 0.82,
            }}
          />
        ) : null}
        {mapAssets.map((mapAsset) => (
          <AssetLayer
            key={mapAsset.id}
            asset={mapAsset}
            onError={reportError}
          />
        ))}
      </Map>
      <div className="story-map__label">
        {mapAssets.map((item) => item.label).join(" + ") || "Basemap"}
      </div>
      {mapAssets.some((item) => item.attribution) ? (
        <div className="story-map__attribution">
          {mapAssets
            .flatMap((item) => (item.attribution ? [item.attribution] : []))
            .join(" · ")}
        </div>
      ) : null}
      {asset?.presentation.legendVisible ? (
        <aside className="story-map__legend" aria-label="Map legend">
          <span
            style={{ background: hexOpacity(asset.presentation.color, 0.9) }}
          />
          {asset.presentation.legendTitle || asset.label}
        </aside>
      ) : null}
      {error ? (
        <div className="story-map__error" role="alert">
          <strong>Map source unavailable</strong>
          <span>{error}</span>
          {asset ? (
            <a href={asset.href} target="_blank" rel="noreferrer">
              Open source
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

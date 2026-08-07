import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import maplibregl from "maplibre-gl";
import Map, {
  Layer,
  NavigationControl,
  Source,
  type MapRef,
} from "react-map-gl/maplibre";
import { PMTiles, Protocol } from "pmtiles";
import type {
  PublicationAsset,
  PublicationChapter,
} from "@earth-stories/story-schema";
import "maplibre-gl/dist/maplibre-gl.css";
import { geoJsonBounds } from "./geoBounds.js";

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
  autoFit?: boolean;
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

function categoryColor(
  presentation: PublicationAsset["presentation"],
): string | unknown[] {
  if (!presentation.symbolProperty) return presentation.color;
  const stops = Object.entries(presentation.categoryColors).flatMap(
    ([value, color]) => [value, color],
  );
  return stops.length
    ? [
        "match",
        ["to-string", ["get", presentation.symbolProperty]],
        ...stops,
        presentation.color,
      ]
    : presentation.color;
}

function featureFilter(
  presentation: PublicationAsset["presentation"],
): unknown[] | undefined {
  return presentation.filterProperty && presentation.filterValue !== null
    ? [
        "==",
        ["to-string", ["get", presentation.filterProperty]],
        presentation.filterValue,
      ]
    : undefined;
}

const terrainCompatible = (asset: PublicationAsset) =>
  asset.kind === "pmtiles" ||
  asset.kind === "geojson" ||
  asset.kind === "trajectory" ||
  asset.kind === "xyz";

function AssetLayer({
  asset,
  onError,
  onBounds,
}: {
  asset: PublicationAsset;
  onError: (message: string) => void;
  onBounds?: (bounds: [number, number, number, number]) => void;
}) {
  const [pmtilesLayers, setPmtilesLayers] = useState<string[]>([]);
  const [trajectory, setTrajectory] =
    useState<GeoJSON.FeatureCollection | null>(null);
  const [geojson, setGeojson] = useState<GeoJSON.GeoJSON | null>(null);
  const [trajectoryProgress, setTrajectoryProgress] = useState(1);
  const [trajectoryPlaying, setTrajectoryPlaying] = useState(false);
  const presentation = asset.presentation;
  const dataColor = categoryColor(presentation);
  const dataFilter = featureFilter(presentation);
  const filterProps = dataFilter ? { filter: dataFilter as never } : {};
  const assetUrl = useMemo(() => absoluteAssetUrl(asset.href), [asset.href]);
  useEffect(() => {
    let active = true;
    let registeredArchive: PMTiles | null = null;
    const controller = new AbortController();
    if (asset.kind === "pmtiles") {
      ensurePmtilesProtocol();
      const archive = new PMTiles(assetUrl);
      registeredArchive = archive;
      protocol?.add(archive);
      Promise.all([archive.getMetadata(), archive.getHeader()])
        .then(([raw, header]) => {
          const metadata = raw as { vector_layers?: Array<{ id?: unknown }> };
          if (active) {
            setPmtilesLayers(
              (metadata.vector_layers ?? []).flatMap((layer) =>
                typeof layer.id === "string" ? [layer.id] : [],
              ),
            );
            onBounds?.([
              header.minLon,
              header.minLat,
              header.maxLon,
              header.maxLat,
            ]);
          }
        })
        .catch(
          (cause: unknown) =>
            active &&
            onError(
              cause instanceof Error
                ? cause.message
                : "The PMTiles archive could not be opened.",
            ),
        );
    }
    if (asset.kind === "trajectory") {
      setTrajectory(null);
      setTrajectoryProgress(1);
      fetch(assetUrl, { signal: controller.signal })
        .then((response) => {
          if (!response.ok)
            throw new Error(
              `The trajectory source returned ${response.status}.`,
            );
          return response.json();
        })
        .then(
          (data: {
            tracks?: Array<{
              path?: [number, number][];
              timestamps?: number[];
            }>;
          }) => {
            if (!active) return;
            const next = {
              type: "FeatureCollection",
              features: (data.tracks ?? []).map((track, index) => ({
                type: "Feature",
                id: index,
                properties: { timestamps: track.timestamps ?? [] },
                geometry: { type: "LineString", coordinates: track.path ?? [] },
              })),
            } as GeoJSON.FeatureCollection;
            setTrajectory(next);
            const bounds = geoJsonBounds(next);
            if (bounds) onBounds?.(bounds);
          },
        )
        .catch(
          (cause: unknown) =>
            active &&
            cause instanceof Error &&
            cause.name !== "AbortError" &&
            onError(
              cause instanceof Error
                ? cause.message
                : "The trajectory could not be opened.",
            ),
        );
    }
    if (asset.kind === "geojson") {
      setGeojson(null);
      fetch(assetUrl, { signal: controller.signal })
        .then((response) => {
          if (!response.ok)
            throw new Error(`The GeoJSON source returned ${response.status}.`);
          return response.json();
        })
        .then((data: GeoJSON.GeoJSON) => {
          if (!active) return;
          setGeojson(data);
          const bounds = geoJsonBounds(data);
          if (bounds) onBounds?.(bounds);
        })
        .catch((cause: unknown) => {
          if (active && cause instanceof Error && cause.name !== "AbortError")
            onError(cause.message);
        });
    }
    return () => {
      active = false;
      controller.abort();
      if (registeredArchive && protocol) {
        const key = registeredArchive.source.getKey();
        if (protocol.tiles.get(key) === registeredArchive)
          protocol.tiles.delete(key);
      }
    };
  }, [asset.kind, assetUrl, onBounds, onError]);
  useEffect(() => {
    if (!trajectoryPlaying || asset.kind !== "trajectory") return;
    const timer = window.setInterval(
      () =>
        setTrajectoryProgress((current) =>
          current >= 1 ? 0.02 : Math.min(1, current + 0.01),
        ),
      50,
    );
    return () => window.clearInterval(timer);
  }, [asset.kind, trajectoryPlaying]);
  const vectorSourceLayers = presentation.sourceLayer
    ? [presentation.sourceLayer]
    : pmtilesLayers;
  const resolvedAsset = useMemo(
    () => ({ ...asset, href: assetUrl }),
    [asset, assetUrl],
  );
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
        <CogOverlay
          asset={asset}
          url={assetUrl}
          onError={onError}
          onBounds={onBounds}
        />
      </Suspense>
    );
  if (asset.kind === "geoparquet")
    return (
      <Suspense fallback={null}>
        <GeoParquetOverlay
          asset={resolvedAsset}
          onError={onError}
          onBounds={onBounds}
        />
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
    (asset.kind === "geojson" && geojson) ||
    (asset.kind === "trajectory" && displayedTrajectory)
  ) {
    return (
      <>
        <Source
          id={asset.id}
          type="geojson"
          data={asset.kind === "trajectory" ? displayedTrajectory! : geojson!}
        >
          <Layer
            id={`${asset.id}-fill`}
            type="fill"
            {...filterProps}
            paint={{
              "fill-color": dataColor as never,
              "fill-opacity": presentation.opacity * 0.45,
            }}
          />
          <Layer
            id={`${asset.id}-line`}
            type="line"
            {...filterProps}
            paint={{
              "line-color": dataColor as never,
              "line-opacity": presentation.opacity,
              "line-width": asset.kind === "trajectory" ? 4 : 2,
            }}
          />
          <Layer
            id={`${asset.id}-points`}
            type="circle"
            {...filterProps}
            paint={{
              "circle-radius": presentation.radius,
              "circle-color": dataColor as never,
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
            <button
              type="button"
              onClick={() => setTrajectoryPlaying((playing) => !playing)}
            >
              {trajectoryPlaying ? "Pause" : "Play"}
            </button>
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
            {...filterProps}
            paint={{
              "fill-color": dataColor as never,
              "fill-opacity": presentation.opacity * 0.45,
            }}
          />,
          <Layer
            key={`${sourceLayer}-line`}
            id={`${asset.id}-${sourceLayer}-line`}
            source-layer={sourceLayer}
            type="line"
            {...filterProps}
            paint={{
              "line-color": dataColor as never,
              "line-opacity": presentation.opacity,
              "line-width": 1.5,
            }}
          />,
          <Layer
            key={`${sourceLayer}-point`}
            id={`${asset.id}-${sourceLayer}-point`}
            source-layer={sourceLayer}
            type="circle"
            {...filterProps}
            paint={{
              "circle-radius": presentation.radius,
              "circle-color": dataColor as never,
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
  autoFit = false,
}: MapChapterProps) {
  const [ready, setReady] = useState(false);
  const [showBuildingHint, setShowBuildingHint] = useState(
    chapter.camera.zoom < 14,
  );
  const [error, setError] = useState<string | null>(null);
  const reportError = useCallback((message: string) => setError(message), []);
  const mapRef = useRef<MapRef | null>(null);
  const fittedAssetRef = useRef<string | null>(null);
  const activeAssetIdRef = useRef(asset?.id);
  activeAssetIdRef.current = asset?.id;
  useEffect(() => {
    setShowBuildingHint(chapter.camera.zoom < 14);
  }, [chapter.camera.zoom, chapter.id]);
  const fitToBounds = useCallback(
    (bounds: [number, number, number, number]) => {
      if (
        !autoFit ||
        activeAssetIdRef.current !== asset?.id ||
        fittedAssetRef.current === asset?.id
      )
        return;
      const map = mapRef.current;
      if (!map) return;
      fittedAssetRef.current = asset?.id ?? null;
      map.fitBounds(
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ],
        { padding: 64, duration: 0, maxZoom: 16 },
      );
    },
    [asset?.id, autoFit],
  );
  const overlayKey = overlayAssets
    .map(({ id, href }) => `${id}:${href}`)
    .join("|");
  useEffect(
    () => setError(null),
    [asset?.id, asset?.href, basemapStyle, overlayKey],
  );
  useEffect(() => {
    fittedAssetRef.current = null;
  }, [asset?.id]);
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
  const terrainEnabled =
    !!chapter.camera.terrain?.enabled && mapAssets.every(terrainCompatible);

  return (
    <div
      className="story-map"
      aria-label={`Map for ${chapter.title}`}
      data-map-ready={ready ? "true" : "false"}
    >
      <Map
        ref={mapRef}
        {...(controlled
          ? { viewState: initialViewState }
          : { initialViewState })}
        mapStyle={basemapStyle}
        interactive={!controlled}
        projection={chapter.camera.globe ? { type: "globe" } : undefined}
        terrain={
          terrainEnabled
            ? {
                source: "earth-stories-terrain",
                exaggeration: chapter.camera.terrain?.exaggeration ?? 1,
              }
            : undefined
        }
        preserveDrawingBuffer
        onIdle={() => setReady(true)}
        {...(!controlled && chapter.camera.buildings
          ? {
              onMove: (event: { viewState: { zoom: number } }) =>
                setShowBuildingHint(event.viewState.zoom < 14),
            }
          : {})}
        onError={(event: { error: Error }) => setError(event.error.message)}
      >
        {!controlled ? (
          <NavigationControl position="top-right" showCompass visualizePitch />
        ) : null}
        {terrainEnabled ? (
          <Source
            id="earth-stories-terrain"
            type="raster-dem"
            tiles={["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"]}
            tileSize={512}
            encoding="terrarium"
          />
        ) : null}
        {chapter.camera.buildings ? (
          <Source
            id="earth-stories-buildings-source"
            type="vector"
            url="https://tiles.openfreemap.org/planet"
          >
            <Layer
              id="earth-stories-buildings"
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
          </Source>
        ) : null}
        {mapAssets.map((mapAsset) => (
          <AssetLayer
            key={mapAsset.id}
            asset={mapAsset}
            onError={reportError}
            onBounds={mapAsset.id === asset?.id ? fitToBounds : undefined}
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
          <strong>{asset.presentation.legendTitle || asset.label}</strong>
          {Object.keys(asset.presentation.categoryColors).length ? (
            Object.entries(asset.presentation.categoryColors).map(
              ([value, color]) => (
                <span className="story-map__legend-item" key={value}>
                  <i style={{ background: hexOpacity(color, 0.9) }} />
                  {value}
                </span>
              ),
            )
          ) : (
            <span className="story-map__legend-item">
              <i
                style={{
                  background: hexOpacity(asset.presentation.color, 0.9),
                }}
              />
              Data
            </span>
          )}
        </aside>
      ) : null}
      {!controlled && chapter.camera.buildings && showBuildingHint ? (
        <div className="story-map__hint" role="status">
          Zoom in to street level to see 3D buildings.
        </div>
      ) : null}
      {chapter.camera.terrain?.enabled && !terrainEnabled ? (
        <div className="story-map__hint" role="status">
          Terrain is unavailable for this dataset renderer.
        </div>
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

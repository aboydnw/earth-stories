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
  Camera,
  PublicationAsset,
  PublicationChapter,
} from "@earth-stories/story-schema";
import "maplibre-gl/dist/maplibre-gl.css";
import { geoJsonBounds } from "./geoBounds.js";
import { useMapCamera } from "./useMapCamera.js";
import { resolveMapInteraction, runProgrammaticMove } from "./mapCamera.js";
import { TemporalControls } from "./TemporalControls.js";
import {
  formatTemporalTimestamp,
  timestampAtPosition,
  timestepIndex,
} from "./temporal.js";
import { useTemporalPlayback } from "./useTemporalPlayback.js";
import {
  chapterDependencyLocators,
  type PublicationRuntimePolicy,
} from "./publicationRuntime.js";

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
const TrajectoryOverlay = lazy(async () => ({
  default: (await import("./TrajectoryOverlay.js")).TrajectoryOverlay,
}));

export interface MapChapterProps {
  chapter: Extract<PublicationChapter, { type: "map" | "scrolly" }>;
  asset: PublicationAsset | null;
  overlayAssets?: PublicationAsset[];
  basemapStyle: string;
  runtimePolicy?: PublicationRuntimePolicy;
  controlled?: boolean;
  interactive?: boolean;
  followCamera?: boolean;
  autoFit?: boolean;
  commitAutoFit?: boolean;
  fitRequestToken?: string | number;
  snapshotMode?: boolean;
  onMapReady?: (map: maplibregl.Map | null) => void;
  onCameraChange?: (camera: Camera) => void;
  onFitAvailabilityChange?: (available: boolean) => void;
  onFitCameraChange?: (camera: Camera) => void;
  onReady?: () => void;
}

let protocol: Protocol | null = null;
function ensurePmtilesProtocol() {
  if (protocol) return;
  protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
}

const pmtilesArchives = new globalThis.Map<string, PMTiles>();
function ensurePmtilesArchive(url: string) {
  ensurePmtilesProtocol();
  let archive = pmtilesArchives.get(url);
  if (!archive) {
    archive = new PMTiles(url);
    pmtilesArchives.set(url, archive);
    protocol?.add(archive);
  }
  return archive;
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

const ignoreTimeBounds = () => undefined;

function AssetLayer({
  asset,
  onError: reportErrorToParent,
  onBounds,
  map,
  onReady,
  autoFit,
  onAutoFitCameraChange,
  temporalPosition,
  onTimeBounds,
  runtimePolicy,
}: {
  asset: PublicationAsset;
  onError: (message: string) => void;
  onBounds?: (bounds: [number, number, number, number]) => void;
  map?: maplibregl.Map | null;
  onReady?: () => void;
  autoFit?: boolean;
  onAutoFitCameraChange?: () => void;
  temporalPosition: number;
  onTimeBounds: (bounds: [number, number] | null) => void;
  runtimePolicy: PublicationRuntimePolicy;
}) {
  const [pmtilesLayers, setPmtilesLayers] = useState<string[]>([]);
  const [geojson, setGeojson] = useState<GeoJSON.GeoJSON | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const reportReady = useCallback(() => onReadyRef.current?.(), []);
  const onError = useCallback(
    (message: string) => {
      reportErrorToParent(message);
      reportReady();
    },
    [reportErrorToParent, reportReady],
  );
  const presentation = asset.presentation;
  const dataColor = categoryColor(presentation);
  const dataFilter = featureFilter(presentation);
  const filterProps = dataFilter ? { filter: dataFilter as never } : {};
  const assetUrl = useMemo(() => absoluteAssetUrl(asset.href), [asset.href]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (asset.kind === "pmtiles") {
      const archive = ensurePmtilesArchive(assetUrl);
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
            reportReady();
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
    if (asset.kind === "xyz") reportReady();
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
          reportReady();
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
    };
  }, [asset.kind, assetUrl, onBounds, onError, reportReady]);
  useEffect(() => {
    if (asset.kind === "image" || asset.kind === "csv") reportReady();
  }, [asset.kind, reportReady]);
  const vectorSourceLayers = presentation.sourceLayer
    ? [presentation.sourceLayer]
    : pmtilesLayers;
  const resolvedAsset = useMemo(
    () => ({ ...asset, href: assetUrl }),
    [asset, assetUrl],
  );
  if (asset.kind === "cog")
    return (
      <Suspense fallback={null}>
        <CogOverlay
          asset={asset}
          url={assetUrl}
          onError={onError}
          onBounds={onBounds}
          onReady={reportReady}
          projectionDefinitions={runtimePolicy.projectionDefinitions}
          offline={runtimePolicy.offline}
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
          onReady={reportReady}
          runtimeAssets={runtimePolicy.runtimeAssets}
          offline={runtimePolicy.offline}
        />
      </Suspense>
    );
  if (asset.kind === "copc")
    return (
      <Suspense fallback={null}>
        <CopcOverlay
          asset={resolvedAsset}
          map={map ?? null}
          onError={onError}
          onReady={reportReady}
          autoFit={autoFit}
          onFitCameraChange={onAutoFitCameraChange}
        />
      </Suspense>
    );
  if (asset.kind === "zarr")
    return (
      <Suspense fallback={null}>
        <ZarrOverlay
          asset={resolvedAsset}
          onError={onError}
          onReady={reportReady}
          position={temporalPosition}
        />
      </Suspense>
    );
  if (asset.kind === "trajectory")
    return (
      <Suspense fallback={null}>
        <TrajectoryOverlay
          asset={resolvedAsset}
          position={temporalPosition}
          onError={onError}
          onBounds={onBounds}
          onTimeBounds={onTimeBounds}
          onReady={reportReady}
        />
      </Suspense>
    );
  if (asset.kind === "geojson" && geojson) {
    return (
      <>
        <Source id={asset.id} type="geojson" data={geojson}>
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
              "line-width": 2,
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
              "fill-opacity": 0,
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
  runtimePolicy = {
    offline: false,
    runtimeAssets: [],
    projectionDefinitions: [],
    dependencies: [],
  },
  controlled = false,
  interactive,
  followCamera,
  autoFit = false,
  commitAutoFit = false,
  fitRequestToken,
  snapshotMode = false,
  onMapReady,
  onCameraChange,
  onFitAvailabilityChange,
  onFitCameraChange,
  onReady,
}: MapChapterProps) {
  const [ready, setReady] = useState(false);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [primaryBounds, setPrimaryBounds] = useState<
    [number, number, number, number] | null
  >(null);
  const [readyAssets, setReadyAssets] = useState(() => new Set<string>());
  const [showBuildingHint, setShowBuildingHint] = useState(
    chapter.camera.zoom < 14,
  );
  const [error, setError] = useState<string | null>(null);
  const [trajectoryTimeBounds, setTrajectoryTimeBounds] = useState<
    [number, number] | null
  >(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;
  const onFitAvailabilityRef = useRef(onFitAvailabilityChange);
  onFitAvailabilityRef.current = onFitAvailabilityChange;
  const onFitCameraRef = useRef(onFitCameraChange);
  onFitCameraRef.current = onFitCameraChange;
  const reportError = useCallback((message: string) => setError(message), []);
  const mapRef = useRef<MapRef | null>(null);
  const fittedAssetRef = useRef<string | null>(null);
  const fitRequestRef = useRef<string | number | undefined>(undefined);
  const programmaticFitCleanupRef = useRef<(() => void) | null>(null);
  const activeAssetIdRef = useRef(asset?.id);
  activeAssetIdRef.current = asset?.id;
  const autoFitRef = useRef(autoFit);
  autoFitRef.current = autoFit;
  const commitAutoFitRef = useRef(commitAutoFit);
  commitAutoFitRef.current = commitAutoFit;
  const chapterCameraRef = useRef(chapter.camera);
  chapterCameraRef.current = chapter.camera;
  const interaction = resolveMapInteraction({
    controlled,
    interactive,
    followCamera,
  });
  const programmaticCamera = useMapCamera({
    map: mapInstance,
    camera: chapter.camera,
    transition: chapter.transition,
    enabled: interaction.followCamera,
  });
  useEffect(() => {
    setShowBuildingHint(chapter.camera.zoom < 14);
  }, [chapter.camera.zoom, chapter.id]);
  const applyBounds = useCallback(
    (bounds: [number, number, number, number], commit = false) => {
      const map = mapRef.current;
      if (!map) return;
      programmaticFitCleanupRef.current?.();
      programmaticFitCleanupRef.current = runProgrammaticMove(
        map.getMap(),
        programmaticCamera,
        () =>
          map.fitBounds(
            [
              [bounds[0], bounds[1]],
              [bounds[2], bounds[3]],
            ],
            { padding: 64, duration: 0, maxZoom: 16 },
          ),
        commit
          ? () => {
              const instance = map.getMap();
              const center = instance.getCenter();
              onFitCameraRef.current?.({
                ...chapterCameraRef.current,
                center: [center.lng, center.lat],
                zoom: instance.getZoom(),
                bearing: instance.getBearing(),
                pitch: instance.getPitch(),
              });
            }
          : undefined,
        1_250,
      );
    },
    [programmaticCamera],
  );
  const fitToBounds = useCallback(
    (bounds: [number, number, number, number]) => {
      setPrimaryBounds(bounds);
      onFitAvailabilityRef.current?.(true);
      if (
        !autoFitRef.current ||
        fittedAssetRef.current === activeAssetIdRef.current
      )
        return;
      fittedAssetRef.current = activeAssetIdRef.current ?? null;
      applyBounds(bounds, commitAutoFitRef.current);
    },
    [applyBounds],
  );
  const commitCopcFit = useCallback(() => {
    if (!commitAutoFitRef.current) return;
    const instance = mapRef.current?.getMap();
    if (!instance) return;
    const center = instance.getCenter();
    onFitCameraRef.current?.({
      ...chapterCameraRef.current,
      center: [center.lng, center.lat],
      zoom: instance.getZoom(),
      bearing: instance.getBearing(),
      pitch: instance.getPitch(),
    });
  }, []);
  const overlayKey = overlayAssets
    .map(({ id, href }) => `${id}:${href}`)
    .join("|");
  useEffect(
    () => setError(null),
    [asset?.id, asset?.href, basemapStyle, overlayKey],
  );
  useEffect(() => {
    fittedAssetRef.current = null;
    setPrimaryBounds(null);
    onFitAvailabilityRef.current?.(false);
  }, [asset?.id, asset?.href]);
  useEffect(() => {
    if (
      fitRequestToken === undefined ||
      fitRequestRef.current === fitRequestToken ||
      !primaryBounds
    )
      return;
    fitRequestRef.current = fitRequestToken;
    applyBounds(primaryBounds, true);
  }, [applyBounds, fitRequestToken, primaryBounds]);
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
  const mapAssetEntries = mapAssets.map((item) => ({
    item,
    key: `${item.id}:${item.href}`,
  }));
  const zarrStepCount =
    asset?.kind === "zarr" ? (asset.zarr?.timesteps.length ?? 0) : 0;
  const temporal = useTemporalPlayback({
    assetId:
      asset && (asset.kind === "trajectory" || zarrStepCount > 1)
        ? asset.id
        : null,
    chapterId: chapter.id,
    authoredPosition: chapter.temporalPosition,
    stepCount: zarrStepCount || undefined,
    enabled:
      (asset?.kind === "trajectory" && !!trajectoryTimeBounds) ||
      zarrStepCount > 1,
  });
  const temporalLabel =
    asset?.kind === "zarr"
      ? (asset.zarr?.timesteps[timestepIndex(temporal.position, zarrStepCount)]
          ?.label ?? "Time")
      : asset?.kind === "trajectory" && trajectoryTimeBounds
        ? formatTemporalTimestamp(
            timestampAtPosition(
              temporal.position,
              trajectoryTimeBounds[0],
              trajectoryTimeBounds[1],
            ),
          )
        : "";
  const dataReady = mapAssetEntries.every(({ key }) => readyAssets.has(key));
  const markReady = useCallback((key: string) => {
    setReadyAssets((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
  }, []);
  const terrainEnabled =
    !!chapter.camera.terrain?.enabled && mapAssets.every(terrainCompatible);
  const dependencyLocators = chapterDependencyLocators(
    chapter.id,
    runtimePolicy.dependencies,
  );
  const terrainLocator = terrainEnabled
    ? dependencyLocators.terrain
    : undefined;
  const buildingsLocator = chapter.camera.buildings
    ? dependencyLocators.buildings
    : undefined;
  useEffect(() => () => onMapReadyRef.current?.(null), []);
  useEffect(
    () => () => {
      programmaticFitCleanupRef.current?.();
      onFitAvailabilityRef.current?.(false);
    },
    [],
  );
  useEffect(() => {
    if (ready && dataReady) onReadyRef.current?.();
  }, [dataReady, ready]);

  return (
    <div
      className="story-map"
      aria-label={`Map for ${chapter.title}`}
      data-map-ready={ready && dataReady ? "true" : "false"}
    >
      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        mapStyle={basemapStyle}
        interactive={interaction.interactive}
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
        onLoad={() => {
          const next = mapRef.current?.getMap() ?? null;
          setMapInstance(next);
          onMapReadyRef.current?.(next);
        }}
        onIdle={() => setReady(true)}
        onMove={(event: {
          viewState: {
            longitude: number;
            latitude: number;
            zoom: number;
            bearing: number;
            pitch: number;
          };
        }) => {
          if (interaction.interactive && chapter.camera.buildings)
            setShowBuildingHint(event.viewState.zoom < 14);
          if (
            interaction.interactive &&
            !programmaticCamera.current &&
            onCameraChange
          )
            onCameraChange({
              ...chapter.camera,
              center: [event.viewState.longitude, event.viewState.latitude],
              zoom: event.viewState.zoom,
              bearing: event.viewState.bearing,
              pitch: event.viewState.pitch,
            });
        }}
        onError={(event: { error: Error }) => setError(event.error.message)}
      >
        {interaction.interactive ? (
          <NavigationControl position="top-right" showCompass visualizePitch />
        ) : null}
        {terrainLocator ? (
          <Source
            id="earth-stories-terrain"
            type="raster-dem"
            tiles={[terrainLocator]}
            tileSize={512}
            encoding="terrarium"
          />
        ) : null}
        {buildingsLocator ? (
          <Source
            id="earth-stories-buildings-source"
            type="vector"
            url={buildingsLocator}
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
        {mapAssetEntries.map(({ item: mapAsset, key }) => (
          <AssetLayer
            key={key}
            asset={mapAsset}
            onError={reportError}
            onBounds={mapAsset.id === asset?.id ? fitToBounds : undefined}
            map={mapInstance}
            onReady={() => markReady(key)}
            autoFit={autoFit}
            onAutoFitCameraChange={
              mapAsset.id === asset?.id ? commitCopcFit : undefined
            }
            temporalPosition={mapAsset.id === asset?.id ? temporal.position : 0}
            onTimeBounds={
              mapAsset.id === asset?.id
                ? setTrajectoryTimeBounds
                : ignoreTimeBounds
            }
            runtimePolicy={runtimePolicy}
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
      {(zarrStepCount > 1 ||
        (asset?.kind === "trajectory" && trajectoryTimeBounds)) && (
        <TemporalControls
          position={temporal.position}
          label={temporalLabel}
          playing={temporal.playing}
          speed={temporal.speed}
          stepCount={zarrStepCount || undefined}
          timesteps={asset?.kind === "zarr" ? asset.zarr?.timesteps : undefined}
          onScrub={temporal.scrub}
          onStep={temporal.step}
          onToggle={temporal.toggle}
          onSpeed={temporal.setSpeed}
        />
      )}
      {interaction.interactive && buildingsLocator && showBuildingHint ? (
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
        <div
          className="story-map__error"
          role="alert"
          data-error-detail={error}
        >
          <strong>Map source unavailable</strong>
          <span>
            {snapshotMode
              ? "This dataset could not be displayed in the snapshot."
              : "This dataset could not be displayed. The rest of the story is still available."}
          </span>
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

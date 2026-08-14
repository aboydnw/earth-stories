// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicationChapter } from "@earth-stories/story-schema";
import { publicationAsset } from "./testFixtures.js";

vi.mock("react-map-gl/maplibre", async () => {
  const React = await import("react");
  const map = {
    getCenter: () => ({ lng: 0, lat: 0 }),
    getZoom: () => 1,
    getBearing: () => 0,
    getPitch: () => 0,
    once: vi.fn(),
    off: vi.fn(),
    stop: vi.fn(),
    jumpTo: vi.fn(),
    flyTo: vi.fn(),
  };
  return {
    default: React.forwardRef(
      (
        props: {
          children?: React.ReactNode;
          mapStyle?: string;
          projection?: { type: string };
          terrain?: { source: string };
          onError?: (event: { error: Error }) => void;
          onLoad?: () => void;
        },
        ref: React.ForwardedRef<unknown>,
      ) => {
        React.useImperativeHandle(ref, () => ({
          getMap: () => map,
          fitBounds: vi.fn(),
        }));
        React.useEffect(() => {
          props.onLoad?.();
          if (props.mapStyle === "error://style")
            props.onError?.({ error: new Error("Map fixture failed") });
        }, [props.mapStyle, props.onError, props.onLoad]);
        return (
          <div
            data-testid="map-root"
            data-projection={props.projection?.type ?? "mercator"}
            data-terrain={props.terrain?.source ?? "none"}
          >
            {props.children}
          </div>
        );
      },
    ),
    Layer: () => null,
    NavigationControl: () => null,
    Source: ({
      children,
      id,
      tiles,
      url,
    }: {
      children?: React.ReactNode;
      id?: string;
      tiles?: string[];
      url?: string;
    }) => (
      <div
        data-testid={id ? `source-${id}` : undefined}
        data-locator={url ?? tiles?.[0]}
      >
        {children}
      </div>
    ),
  };
});
vi.mock("maplibre-gl", () => ({ default: { addProtocol: vi.fn() } }));
vi.mock("pmtiles", () => ({
  PMTiles: class {
    getMetadata = async () => ({ vector_layers: [{ id: "admin" }] });
    getHeader = async () => ({
      minLon: -180,
      minLat: -85,
      maxLon: 180,
      maxLat: 85,
    });
  },
  Protocol: class {
    tile = vi.fn();
    add = vi.fn();
  },
}));
vi.mock("./CogOverlay.js", () => ({ CogOverlay: () => null }));
vi.mock("./TrajectoryOverlay.js", () => ({ TrajectoryOverlay: () => null }));

import { MapChapter, supportsGlobeProjection } from "./MapChapter.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const asset = publicationAsset({
  id: "geo",
  kind: "geojson",
  label: "GeoJSON",
  href: "data/geo.json",
  delivery: "included",
  presentation: {
    opacity: 1,
    color: "#000000",
    strokeColor: "#000000",
    radius: 4,
    sourceLayer: null,
    rasterBand: 1,
    rescale: null,
    colormap: "viridis",
    legendTitle: "",
    legendVisible: false,
    symbolProperty: null,
    categoryColors: {},
    filterProperty: null,
    filterValue: null,
  },
});
const chapter = {
  id: "map",
  type: "map",
  title: "Map",
  narrative: "",
  assetId: asset.id,
  overlayAssetIds: [],
  transition: "instant",
  camera: { center: [0, 20], zoom: 1.5, bearing: 0, pitch: 0 },
} as Extract<PublicationChapter, { type: "map" }>;

describe("MapChapter", () => {
  it("classifies every supported map renderer by globe compatibility", () => {
    for (const kind of ["pmtiles", "geojson", "xyz"] as const)
      expect(supportsGlobeProjection(publicationAsset({ kind }))).toBe(true);
    for (const kind of [
      "cog",
      "geoparquet",
      "zarr",
      "trajectory",
      "copc",
    ] as const)
      expect(supportsGlobeProjection(publicationAsset({ kind }))).toBe(false);
  });

  it("uses Mercator for an authored globe with a deck-backed primary source", () => {
    render(
      <MapChapter
        chapter={{
          ...chapter,
          camera: { ...chapter.camera, globe: true },
        }}
        asset={publicationAsset({ id: "raster", kind: "cog" })}
        basemapStyle="local/style.json"
      />,
    );

    expect(screen.getByTestId("map-root").getAttribute("data-projection")).toBe(
      "mercator",
    );
    expect(
      screen.getByText(
        "Mercator is used because this dataset renderer does not support globe view.",
      ),
    ).toBeTruthy();
  });

  it("uses Mercator when an authored globe has a deck-backed overlay", () => {
    render(
      <MapChapter
        chapter={{
          ...chapter,
          camera: { ...chapter.camera, globe: true },
        }}
        asset={publicationAsset({ id: "base", kind: "xyz" })}
        overlayAssets={[publicationAsset({ id: "track", kind: "trajectory" })]}
        basemapStyle="local/style.json"
      />,
    );

    expect(screen.getByTestId("map-root").getAttribute("data-projection")).toBe(
      "mercator",
    );
    expect(
      screen.getByText(
        "Mercator is used because this dataset renderer does not support globe view.",
      ),
    ).toBeTruthy();
  });

  it("preserves an authored globe for a PMTiles-only map", () => {
    render(
      <MapChapter
        chapter={{
          ...chapter,
          camera: { ...chapter.camera, globe: true },
        }}
        asset={publicationAsset({
          id: "boundaries",
          kind: "pmtiles",
          tileType: "vector",
        })}
        basemapStyle="local/style.json"
      />,
    );

    expect(screen.getByTestId("map-root").getAttribute("data-projection")).toBe(
      "globe",
    );
    expect(
      screen.queryByText(
        "Mercator is used because this dataset renderer does not support globe view.",
      ),
    ).toBeNull();
  });

  it("renders terrain and buildings only from declared chapter dependencies", () => {
    const networkChapter = {
      ...chapter,
      camera: {
        ...chapter.camera,
        terrain: { enabled: true, exaggeration: 1 },
        buildings: true,
      },
    };
    const { rerender } = render(
      <MapChapter
        chapter={networkChapter}
        asset={{ ...asset, kind: "xyz" }}
        basemapStyle="local/style.json"
        runtimePolicy={{
          offline: false,
          runtimeAssets: [],
          projectionDefinitions: [],
          dependencies: [],
        }}
      />,
    );

    expect(screen.queryByTestId("source-earth-stories-terrain")).toBeNull();
    expect(screen.getByTestId("map-root").getAttribute("data-terrain")).toBe(
      "none",
    );
    expect(screen.getByText(/terrain is unavailable/i)).toBeTruthy();
    expect(
      screen.queryByTestId("source-earth-stories-buildings-source"),
    ).toBeNull();

    rerender(
      <MapChapter
        chapter={networkChapter}
        asset={{ ...asset, kind: "xyz" }}
        basemapStyle="local/style.json"
        runtimePolicy={{
          offline: false,
          runtimeAssets: [],
          projectionDefinitions: [],
          dependencies: [
            {
              id: "chapter:map:terrain",
              owner: { type: "chapter", id: "map" },
              locator: "https://terrain.test/{z}/{x}/{y}.webp",
              estimatedBytes: null,
              delivery: "connected",
              materialization: "none",
              requirements: ["network"],
            },
            {
              id: "chapter:map:buildings",
              owner: { type: "chapter", id: "map" },
              locator: "https://buildings.test/planet",
              estimatedBytes: null,
              delivery: "connected",
              materialization: "none",
              requirements: ["network"],
            },
          ],
        }}
      />,
    );

    expect(
      screen
        .getByTestId("source-earth-stories-terrain")
        .getAttribute("data-locator"),
    ).toBe("https://terrain.test/{z}/{x}/{y}.webp");
    expect(
      screen
        .getByTestId("source-earth-stories-buildings-source")
        .getAttribute("data-locator"),
    ).toBe("https://buildings.test/planet");
  });

  it("exposes the underlying map error to artifact verification", async () => {
    render(
      <MapChapter
        chapter={chapter}
        asset={{ ...asset, kind: "image" }}
        basemapStyle="error://style"
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("data-error-detail")).toBe("Map fixture failed");
  });

  it("keeps camera rerenders stable and accepts bounds from a replacement source", async () => {
    const onFitAvailabilityChange = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [1, 2] },
          },
        ],
      }),
    } as Response);
    const { rerender } = render(
      <MapChapter
        chapter={chapter}
        asset={asset}
        autoFit
        basemapStyle="https://example.com/style.json"
        onFitAvailabilityChange={onFitAvailabilityChange}
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    rerender(
      <MapChapter
        chapter={{ ...chapter, camera: { ...chapter.camera, zoom: 5 } }}
        asset={asset}
        autoFit={false}
        basemapStyle="https://example.com/style.json"
        onFitAvailabilityChange={onFitAvailabilityChange}
      />,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(fetchMock).toHaveBeenCalledOnce();

    onFitAvailabilityChange.mockClear();
    rerender(
      <MapChapter
        chapter={{ ...chapter, assetId: "geo-2" }}
        asset={{ ...asset, id: "geo-2", href: "data/geo-2.json" }}
        autoFit={false}
        basemapStyle="https://example.com/style.json"
        onFitAvailabilityChange={onFitAvailabilityChange}
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(onFitAvailabilityChange).toHaveBeenCalledWith(true),
    );
  });
});

// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
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
        props: { children?: React.ReactNode; onLoad?: () => void },
        ref: React.ForwardedRef<unknown>,
      ) => {
        React.useImperativeHandle(ref, () => ({
          getMap: () => map,
          fitBounds: vi.fn(),
        }));
        React.useEffect(() => props.onLoad?.(), [props.onLoad]);
        return <div>{props.children}</div>;
      },
    ),
    Layer: () => null,
    NavigationControl: () => null,
    Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});
vi.mock("maplibre-gl", () => ({ default: { addProtocol: vi.fn() } }));

import { MapChapter } from "./MapChapter.js";

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

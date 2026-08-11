// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicationAsset } from "@earth-stories/story-schema";

let finishMove: (() => void) | undefined;
const flyToPointCloud = vi.fn();
vi.mock("maplibre-gl-lidar", () => ({
  LidarControl: class {
    loadPointCloudStreaming = vi.fn().mockResolvedValue({ id: "cloud" });
    flyToPointCloud = flyToPointCloud;
    unloadPointCloud = vi.fn();
  },
}));

import { CopcOverlay } from "./CopcOverlay.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  finishMove = undefined;
  flyToPointCloud.mockClear();
});

describe("CopcOverlay", () => {
  it("reports the fitted camera after its initial automatic move", async () => {
    const onFitCameraChange = vi.fn();
    const map = {
      addControl: vi.fn(),
      removeControl: vi.fn(),
      once: vi.fn((_event: string, handler: () => void) => {
        finishMove = handler;
      }),
      off: vi.fn(),
    };
    render(
      <CopcOverlay
        asset={
          {
            id: "cloud",
            kind: "copc",
            href: "data/cloud.copc.laz",
            copc: { colorMode: "elevation", pointSize: 2 },
          } as PublicationAsset
        }
        map={map as never}
        onError={() => undefined}
        autoFit
        onFitCameraChange={onFitCameraChange}
      />,
    );

    await waitFor(() => expect(flyToPointCloud).toHaveBeenCalledWith("cloud"));
    act(() => finishMove?.());
    expect(onFitCameraChange).toHaveBeenCalledOnce();
  });

  it("marks the overlay ready without committing an intermediate fallback camera", async () => {
    vi.useFakeTimers();
    const onReady = vi.fn();
    const onFitCameraChange = vi.fn();
    const map = {
      addControl: vi.fn(),
      removeControl: vi.fn(),
      once: vi.fn((_event: string, handler: () => void) => {
        finishMove = handler;
      }),
      off: vi.fn(),
    };
    render(
      <CopcOverlay
        asset={
          {
            id: "cloud",
            kind: "copc",
            href: "data/cloud.copc.laz",
            copc: { colorMode: "elevation", pointSize: 2 },
          } as PublicationAsset
        }
        map={map as never}
        onError={() => undefined}
        onReady={onReady}
        autoFit
        onFitCameraChange={onFitCameraChange}
      />,
    );

    await act(async () => undefined);
    expect(flyToPointCloud).toHaveBeenCalledWith("cloud");
    act(() => vi.advanceTimersByTime(1_250));
    expect(onReady).toHaveBeenCalledOnce();
    expect(onFitCameraChange).not.toHaveBeenCalled();
    act(() => finishMove?.());
    expect(onReady).toHaveBeenCalledOnce();
    expect(onFitCameraChange).toHaveBeenCalledOnce();
    expect(map.off).toHaveBeenCalledWith("moveend", finishMove);
  });
});

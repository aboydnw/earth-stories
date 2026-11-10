// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMapCamera } from "./useMapCamera.js";

afterEach(cleanup);

describe("useMapCamera", () => {
  it("stops the prior animation before listening for the new movement", () => {
    const order: string[] = [];
    const map = {
      getCenter: () => ({ lng: 0, lat: 0 }),
      getZoom: () => 1,
      getBearing: () => 0,
      getPitch: () => 0,
      stop: vi.fn(() => order.push("stop")),
      once: vi.fn(() => order.push("listen")),
      off: vi.fn(),
      jumpTo: vi.fn(() => order.push("move")),
    };

    renderHook(() =>
      useMapCamera({
        map: map as never,
        camera: { center: [10, 20], zoom: 5, bearing: 0, pitch: 0 },
        transition: "instant",
        enabled: true,
      }),
    );

    expect(order).toEqual(["stop", "listen", "move"]);
  });
});

describe("chapter navigation", () => {
  it("returns to an identical authored camera on a new chapter, but not on ordinary rerenders", () => {
    const map = {
      getCenter: () => ({ lng: 10, lat: 20 }),
      getZoom: () => 5,
      getBearing: () => 0,
      getPitch: () => 0,
      stop: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
      jumpTo: vi.fn(),
    };
    const camera = {
      center: [10, 20] as [number, number],
      zoom: 5,
      bearing: 0,
      pitch: 0,
    };
    const { rerender } = renderHook(
      ({ navigationKey }) =>
        useMapCamera({
          map: map as never,
          camera,
          transition: "instant",
          enabled: true,
          navigationKey,
        }),
      { initialProps: { navigationKey: "one" } },
    );
    expect(map.jumpTo).not.toHaveBeenCalled();
    rerender({ navigationKey: "two" });
    expect(map.jumpTo).toHaveBeenCalledTimes(1);
    rerender({ navigationKey: "two" });
    expect(map.jumpTo).toHaveBeenCalledTimes(1);
  });
});

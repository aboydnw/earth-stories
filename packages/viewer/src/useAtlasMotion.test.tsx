// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Camera } from "@earth-stories/story-schema";
import { ATLAS_TRANSITION_MS, useAtlasMotion } from "./useAtlasMotion.js";
import { useMapCamera } from "./useMapCamera.js";
import { useTemporalPlayback } from "./useTemporalPlayback.js";

let time = 0;
let nextFrame = 0;
let frames = new Map<number, FrameRequestCallback>();
let media: EventTarget & { matches: boolean };

beforeEach(() => {
  time = 0;
  nextFrame = 0;
  frames = new Map();
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => media);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.spyOn(performance, "now").mockImplementation(() => time);
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function advance(ms: number) {
  act(() => {
    time += ms;
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(time);
  });
}

function visibility(hidden: boolean) {
  act(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: hidden,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function reducedMotion(matches: boolean) {
  act(() => {
    media.matches = matches;
    media.dispatchEvent(new Event("change"));
  });
}

function fixtureMap(camera: Camera) {
  let current = camera;
  return {
    getCenter: () => ({ lng: current.center[0], lat: current.center[1] }),
    getZoom: () => current.zoom,
    getBearing: () => current.bearing,
    getPitch: () => current.pitch,
    stop: vi.fn(),
    jumpTo: vi.fn((next: Camera) => {
      current = next;
    }),
    explore: (next: Camera) => {
      current = next;
    },
  };
}

const origin: Camera = { center: [0, 0], zoom: 2, bearing: 0, pitch: 0 };
const destination: Camera = {
  center: [40, 20],
  zoom: 6,
  bearing: 60,
  pitch: 20,
};

function synchronizedReader() {
  const map = fixtureMap(origin);
  const hook = renderHook(
    ({ chapterKey, target, position, assetId }) => {
      const motion = useAtlasMotion({ chapterKey });
      useMapCamera({
        map: map as never,
        camera: target,
        transition: "fly-to",
        enabled: true,
        navigationKey: chapterKey,
        motion,
      });
      const temporal = useTemporalPlayback({
        assetId,
        chapterId: chapterKey,
        authoredPosition: position,
        enabled: true,
        motion,
      });
      return { motion, temporal };
    },
    {
      initialProps: {
        chapterKey: "one",
        target: origin,
        position: 0.2,
        assetId: "track",
      },
    },
  );
  return { ...hook, map };
}

describe("atlas chapter motion", () => {
  it("settles initial mount and shares every eased frame between camera and recorded time", () => {
    const { result, rerender, map } = synchronizedReader();
    expect(result.current.motion.progress).toBe(1);
    expect(result.current.temporal.position).toBe(0.2);
    expect(frames.size).toBe(0);
    rerender({
      chapterKey: "two",
      target: destination,
      position: 1,
      assetId: "track",
    });
    expect(result.current.motion.progress).toBe(0);
    expect(map.getZoom()).toBe(2);
    expect(result.current.temporal.position).toBe(0.2);
    for (const eased of [0.0625, 0.5, 0.9375, 1]) {
      advance(ATLAS_TRANSITION_MS / 4);
      expect(result.current.motion.easedProgress).toBe(eased);
      expect(map.getZoom()).toBeCloseTo(2 + 4 * eased);
      expect(result.current.temporal.position).toBeCloseTo(0.2 + 0.8 * eased);
    }
    expect(result.current.motion.transitioning).toBe(false);
    expect(frames.size).toBe(0);
  });

  it("pauses both tracks and resumes from the same frame without counting paused time", () => {
    const { result, rerender, map } = synchronizedReader();
    rerender({
      chapterKey: "two",
      target: destination,
      position: 1,
      assetId: "track",
    });
    advance(400);
    act(() => result.current.motion.pause());
    advance(10_000);
    expect(result.current.motion.progress).toBe(0.25);
    expect(result.current.temporal.position).toBeCloseTo(0.25);
    expect(map.getZoom()).toBeCloseTo(2.25);
    expect(result.current.temporal.playDisabled).toBe(true);
    act(() => result.current.temporal.toggle());
    expect(result.current.temporal.playing).toBe(false);
    act(() => result.current.motion.resume());
    advance(400);
    expect(result.current.motion.progress).toBe(0.5);
    expect(result.current.temporal.position).toBeCloseTo(0.6);
    expect(map.getZoom()).toBe(4);
  });

  it("freezes in a hidden tab and resumes without a background time jump", () => {
    const { result, rerender, map } = synchronizedReader();
    rerender({
      chapterKey: "two",
      target: destination,
      position: 1,
      assetId: "track",
    });
    advance(800);
    visibility(true);
    advance(60_000);
    expect(result.current.motion.suspended).toBe(true);
    expect(result.current.motion.progress).toBe(0.5);
    expect(map.getZoom()).toBe(4);
    visibility(false);
    advance(400);
    expect(result.current.motion.progress).toBe(0.75);
  });

  it.each(["skip", "off", "reduced"] as const)(
    "%s settles camera and time, including while paused",
    (action) => {
      const { result, rerender, map } = synchronizedReader();
      rerender({
        chapterKey: "two",
        target: destination,
        position: 1,
        assetId: "track",
      });
      advance(400);
      act(() => result.current.motion.pause());
      if (action === "reduced") reducedMotion(true);
      else
        act(() =>
          action === "skip"
            ? result.current.motion.skip()
            : result.current.motion.setEnabled(false),
        );
      expect(result.current.motion.progress).toBe(1);
      expect(result.current.temporal.position).toBe(1);
      expect(map.getZoom()).toBe(6);
      expect(frames.size).toBe(0);
      act(() => result.current.temporal.scrub(0.3));
      expect(result.current.temporal.position).toBe(0.3);
    },
  );

  it("cancels old frames and retargets the latest chapter from its current view and time", () => {
    const { result, rerender, map } = synchronizedReader();
    rerender({
      chapterKey: "two",
      target: destination,
      position: 1,
      assetId: "track",
    });
    advance(800);
    const staleFrame = [...frames.values()][0]!;
    rerender({
      chapterKey: "three",
      target: { ...origin, zoom: 8 },
      position: 0,
      assetId: "track",
    });
    expect(map.getZoom()).toBe(4);
    expect(result.current.temporal.position).toBeCloseTo(0.6);
    act(() => staleFrame(9_999));
    expect(result.current.motion.progress).toBe(0);
    advance(800);
    expect(map.getZoom()).toBe(6);
    expect(result.current.temporal.position).toBeCloseTo(0.3);
    rerender({
      chapterKey: "one",
      target: origin,
      position: 0.2,
      assetId: "track",
    });
    advance(1_600);
    expect(map.getZoom()).toBe(2);
    expect(result.current.temporal.position).toBeCloseTo(0.2);
  });

  it("yields to map exploration without snapping, then follows the next chapter", () => {
    const { result, rerender, map } = synchronizedReader();
    rerender({
      chapterKey: "two",
      target: destination,
      position: 1,
      assetId: "track",
    });
    advance(400);
    act(() => result.current.motion.interrupt());
    map.explore({ ...origin, zoom: 10 });
    advance(4_000);
    expect(map.getZoom()).toBe(10);
    expect(result.current.temporal.position).toBeCloseTo(0.25);
    expect(result.current.motion.easedProgress).toBe(1);
    expect(result.current.motion.interrupted).toBe(true);
    rerender({
      chapterKey: "three",
      target: destination,
      position: 1,
      assetId: "track",
    });
    advance(800);
    expect(map.getZoom()).toBe(8);
    expect(result.current.temporal.position).toBeCloseTo(0.625);
  });

  it("manual scrub and Play take over the shared transition without residual writes", () => {
    const { result, rerender, map } = synchronizedReader();
    rerender({
      chapterKey: "two",
      target: destination,
      position: 1,
      assetId: "track",
    });
    advance(400);
    act(() => result.current.temporal.scrub(0.4));
    advance(2_000);
    expect(result.current.temporal.position).toBe(0.4);
    expect(map.getZoom()).toBeCloseTo(2.25);
    act(() => result.current.temporal.toggle());
    advance(16);
    advance(1_200);
    expect(result.current.temporal.playing).toBe(true);
    expect(result.current.temporal.position).toBeCloseTo(0.5);
    act(() => result.current.motion.pause());
    advance(2_000);
    expect(result.current.temporal.playing).toBe(false);
    expect(result.current.temporal.position).toBeCloseTo(0.5);
  });

  it("does not interpolate between different data assets", () => {
    const { result, rerender } = synchronizedReader();
    rerender({
      chapterKey: "two",
      target: destination,
      position: 0.8,
      assetId: "different-track",
    });
    expect(result.current.temporal.position).toBe(0.8);
    advance(400);
    expect(result.current.temporal.position).toBe(0.8);
  });

  it("does not replay mounted map/time when a chapter scene re-enters mid-transition", () => {
    const { result: clock, rerender } = renderHook(
      ({ chapterKey }) => useAtlasMotion({ chapterKey }),
      { initialProps: { chapterKey: "one" } },
    );
    rerender({ chapterKey: "two" });
    advance(400);
    const map = fixtureMap(destination);
    const { result } = renderHook(() => {
      useMapCamera({
        map: map as never,
        camera: destination,
        transition: "fly-to",
        enabled: true,
        navigationKey: "two",
        motion: clock.current,
      });
      return useTemporalPlayback({
        assetId: "track",
        chapterId: "two",
        authoredPosition: 0.8,
        enabled: true,
        motion: clock.current,
      });
    });
    expect(map.getZoom()).toBe(6);
    expect(result.current.position).toBe(0.8);
  });

  it("settles read-all and reduced-motion navigation without requesting frames", () => {
    const { result, rerender } = renderHook(
      ({ chapterKey, active }) => useAtlasMotion({ chapterKey, active }),
      { initialProps: { chapterKey: "one", active: true } },
    );
    reducedMotion(true);
    rerender({ chapterKey: "two", active: true });
    expect(result.current.progress).toBe(1);
    expect(frames.size).toBe(0);
    reducedMotion(false);
    rerender({ chapterKey: "three", active: true });
    expect(result.current.progress).toBe(0);
    rerender({ chapterKey: "three", active: false });
    expect(result.current.progress).toBe(1);
    expect(frames.size).toBe(0);
    rerender({ chapterKey: "three", active: true });
    expect(result.current.progress).toBe(1);
  });

  it("keeps a newly selected chapter paused and resumes only its latest destination", () => {
    const { result, rerender, map } = synchronizedReader();
    rerender({
      chapterKey: "two",
      target: destination,
      position: 1,
      assetId: "track",
    });
    advance(400);
    act(() => result.current.motion.pause());
    rerender({
      chapterKey: "three",
      target: { ...origin, zoom: 8 },
      position: 0,
      assetId: "track",
    });
    advance(5_000);
    expect(result.current.motion.progress).toBe(0);
    expect(result.current.motion.paused).toBe(true);
    expect(map.getZoom()).toBe(2.25);
    expect(result.current.temporal.position).toBeCloseTo(0.25);
    act(() => result.current.motion.resume());
    advance(800);
    expect(map.getZoom()).toBe(5.125);
    expect(result.current.temporal.position).toBeCloseTo(0.125);
  });

  it("cancels queued frames when the atlas is unmounted", () => {
    const { result, rerender, unmount } = renderHook(
      ({ chapterKey }) => useAtlasMotion({ chapterKey }),
      { initialProps: { chapterKey: "one" } },
    );
    rerender({ chapterKey: "two" });
    const stale = [...frames.values()][0]!;
    unmount();
    expect(frames.size).toBe(0);
    act(() => stale(1_600));
    expect(result.current.progress).toBe(0);
    expect(frames.size).toBe(0);
  });

  it("retains the legacy 650ms temporal transition outside the atlas context", () => {
    const { result, rerender } = renderHook(
      ({ chapterId, authoredPosition }) =>
        useTemporalPlayback({
          assetId: "track",
          chapterId,
          authoredPosition,
          enabled: true,
        }),
      { initialProps: { chapterId: "one", authoredPosition: 0.2 } },
    );
    advance(650);
    rerender({ chapterId: "two", authoredPosition: 0.8 });
    advance(325);
    expect(result.current.position).toBeCloseTo(0.725);
    advance(325);
    expect(result.current.position).toBeCloseTo(0.8);
  });
});

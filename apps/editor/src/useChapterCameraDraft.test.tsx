// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Camera } from "@earth-stories/story-schema";
import { useChapterCameraDraft } from "./useChapterCameraDraft";

const initial: Camera = {
  center: [-77, 38],
  zoom: 8,
  bearing: 0,
  pitch: 20,
};
const moved: Camera = {
  center: [-76.5, 38.4],
  zoom: 9,
  bearing: 12,
  pitch: 30,
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useChapterCameraDraft", () => {
  it("debounces user movement, commits once, and keeps one-step Undo", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useChapterCameraDraft({
        chapterId: "map-a",
        camera: initial,
        savedCamera: initial,
        onCommit,
        delay: 700,
      }),
    );

    act(() => result.current.onUserCameraChange(moved));
    expect(result.current.status).toBe("changed");
    expect(onCommit).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(700));
    expect(onCommit).toHaveBeenCalledWith(moved);
    expect(result.current.status).toBe("updated");
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(onCommit).toHaveBeenLastCalledWith(initial);
    expect(result.current.camera).toEqual(initial);
  });

  it("ignores float noise and cancels a stale chapter timer", () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ chapterId, camera }) =>
        useChapterCameraDraft({
          chapterId,
          camera,
          savedCamera: initial,
          onCommit,
          delay: 700,
        }),
      { initialProps: { chapterId: "map-a", camera: initial } },
    );

    act(() =>
      result.current.onUserCameraChange({
        ...initial,
        zoom: initial.zoom + 0.00001,
      }),
    );
    act(() => vi.advanceTimersByTime(700));
    expect(onCommit).not.toHaveBeenCalled();

    act(() => result.current.onUserCameraChange(moved));
    rerender({ chapterId: "map-b", camera: { ...initial, zoom: 4 } });
    act(() => vi.advanceTimersByTime(700));
    expect(onCommit).not.toHaveBeenCalled();
    expect(result.current.camera.zoom).toBe(4);
  });

  it("resets to the last persisted camera instead of the mutable draft", () => {
    const onCommit = vi.fn();
    const saved = { ...initial, zoom: 6 };
    const { result } = renderHook(() =>
      useChapterCameraDraft({
        chapterId: "map-a",
        camera: moved,
        savedCamera: saved,
        onCommit,
      }),
    );

    act(() => result.current.resetToSaved());

    expect(result.current.camera).toEqual(saved);
    expect(onCommit).toHaveBeenCalledWith(saved);
  });

  it("follows an explicit camera edit for the current chapter", () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ camera }) =>
        useChapterCameraDraft({
          chapterId: "map-a",
          camera,
          savedCamera: initial,
          onCommit,
        }),
      { initialProps: { camera: initial } },
    );

    rerender({ camera: moved });

    expect(result.current.camera).toEqual(moved);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits an explicit fitted view immediately and makes it undoable", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useChapterCameraDraft({
        chapterId: "map-a",
        camera: initial,
        savedCamera: initial,
        onCommit,
      }),
    );
    act(() => result.current.applyProgrammaticCamera(moved));
    expect(onCommit).toHaveBeenCalledWith(moved);
    expect(result.current.camera).toEqual(moved);
    expect(result.current.canUndo).toBe(true);
  });
});

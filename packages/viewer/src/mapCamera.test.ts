import { afterEach, describe, expect, it, vi } from "vitest";
import type { Camera } from "@earth-stories/story-schema";
import {
  cameraCommand,
  FLY_TO_DURATION_MS,
  runProgrammaticMove,
  resolveMapInteraction,
} from "./mapCamera.js";

const camera: Camera = {
  center: [10, 20],
  zoom: 5,
  bearing: 30,
  pitch: 40,
};

describe("cameraCommand", () => {
  afterEach(() => vi.useRealTimers());
  it("uses a fixed fly-to duration", () => {
    expect(cameraCommand(camera, "fly-to", false)).toEqual({
      method: "flyTo",
      options: {
        center: [10, 20],
        zoom: 5,
        bearing: 30,
        pitch: 40,
        duration: FLY_TO_DURATION_MS,
        essential: false,
      },
    });
  });

  it("jumps for instant and reduced-motion transitions", () => {
    expect(cameraCommand(camera, "instant", false).method).toBe("jumpTo");
    expect(cameraCommand(camera, "fly-to", true).method).toBe("jumpTo");
  });

  it("marks a move as programmatic until moveend and registers first", () => {
    const order: string[] = [];
    let finish: (() => void) | null = null;
    const map = {
      once: (_event: "moveend", listener: () => void) => {
        order.push("listen");
        finish = listener;
      },
      off: vi.fn(),
    };
    const programmatic = { current: false };

    const cleanup = runProgrammaticMove(
      map,
      programmatic,
      () => {
        order.push("move");
        expect(programmatic.current).toBe(true);
      },
      () => order.push("complete"),
    );

    expect(order).toEqual(["listen", "move"]);
    expect(programmatic.current).toBe(true);
    (finish as (() => void) | null)?.();
    expect(programmatic.current).toBe(false);
    expect(order).toEqual(["listen", "move", "complete"]);
    cleanup();
    expect(map.off).toHaveBeenCalledWith("moveend", finish);
    expect(programmatic.current).toBe(false);
  });

  it("clears a programmatic move with an optional fallback timeout", () => {
    vi.useFakeTimers();
    let finish: (() => void) | null = null;
    const map = {
      once: vi.fn((_event: "moveend", listener: () => void) => {
        finish = listener;
      }),
      off: vi.fn(),
    };
    const programmatic = { current: false };
    const onComplete = vi.fn();

    runProgrammaticMove(map, programmatic, () => undefined, onComplete, 1_250);
    vi.advanceTimersByTime(1_250);

    expect(programmatic.current).toBe(false);
    expect(map.off).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    (finish as (() => void) | null)?.();
    expect(map.off).toHaveBeenCalledWith("moveend", finish);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("separates interaction from following camera props with controlled compatibility", () => {
    expect(resolveMapInteraction({ controlled: false })).toEqual({
      interactive: true,
      followCamera: false,
    });
    expect(resolveMapInteraction({ controlled: true })).toEqual({
      interactive: false,
      followCamera: true,
    });
    expect(
      resolveMapInteraction({
        controlled: true,
        interactive: true,
        followCamera: true,
      }),
    ).toEqual({ interactive: true, followCamera: true });
  });
});

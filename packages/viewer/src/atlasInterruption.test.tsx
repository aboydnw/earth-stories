// @vitest-environment jsdom
import { useEffect, useRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAtlasMotion } from "./useAtlasMotion.js";
import { useMapCamera } from "./useMapCamera.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each(["keydown", "click"] as const)(
  "preserves the reader animation started by a native %s handler after interruption",
  (eventName) => {
    const media = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal("matchMedia", () => media);
    let readerAnimation = false;
    const calls: string[] = [];
    const map = {
      getCenter: () => ({ lng: 0, lat: 0 }),
      getZoom: () => 2,
      getBearing: () => 0,
      getPitch: () => 0,
      stop: () => {
        calls.push("stop");
        readerAnimation = false;
      },
      jumpTo: vi.fn(),
    };
    function Reader() {
      const motion = useAtlasMotion({ chapterKey: "chapter" });
      useMapCamera({
        map: map as never,
        camera: { center: [0, 0], zoom: 2, bearing: 0, pitch: 0 },
        transition: "fly-to",
        enabled: true,
        navigationKey: "chapter",
        motion,
      });
      const control = useRef<HTMLButtonElement>(null);
      useEffect(() => {
        const node = control.current!;
        // MapLibre's keyboard and NavigationControl listeners are native:
        // their user ease starts after React capture, before passive effects.
        const nativeInput = () => {
          calls.push("user-easeTo");
          readerAnimation = true;
        };
        node.addEventListener(eventName, nativeInput);
        return () => node.removeEventListener(eventName, nativeInput);
      }, []);
      const interrupt = () => {
        motion.interrupt();
        map.stop();
      };
      return (
        <div onKeyDownCapture={interrupt} onClickCapture={interrupt}>
          <button type="button" ref={control}>
            Zoom in
          </button>
        </div>
      );
    }
    render(<Reader />);
    calls.length = 0;
    const control = screen.getByRole("button", { name: "Zoom in" });
    if (eventName === "keydown")
      fireEvent.keyDown(control, { key: "ArrowRight" });
    else fireEvent.click(control);
    expect(calls).toEqual(["stop", "user-easeTo"]);
    expect(readerAnimation).toBe(true);
  },
);

import { describe, expect, it } from "vitest";
import type { Camera } from "@earth-stories/story-schema";
import { cameraCommand, FLY_TO_DURATION_MS } from "./mapCamera.js";

const camera: Camera = {
  center: [10, 20],
  zoom: 5,
  bearing: 30,
  pitch: 40,
};

describe("cameraCommand", () => {
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
});

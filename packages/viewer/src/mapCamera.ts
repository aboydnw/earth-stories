import type { Camera } from "@earth-stories/story-schema";

export const FLY_TO_DURATION_MS = 2_500;

export function cameraCommand(
  camera: Camera,
  transition: "fly-to" | "instant",
  reducedMotion: boolean,
) {
  const options = {
    center: camera.center,
    zoom: camera.zoom,
    bearing: camera.bearing,
    pitch: camera.pitch,
  };
  return transition === "fly-to" && !reducedMotion
    ? {
        method: "flyTo" as const,
        options: { ...options, duration: FLY_TO_DURATION_MS, essential: false },
      }
    : { method: "jumpTo" as const, options };
}

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

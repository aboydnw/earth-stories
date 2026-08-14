import type { Camera } from "@earth-stories/story-schema";

export const FLY_TO_DURATION_MS = 2_500;

export function resolveMapInteraction({
  controlled = false,
  interactive,
  followCamera,
}: {
  controlled?: boolean;
  interactive?: boolean;
  followCamera?: boolean;
}) {
  return {
    interactive: interactive ?? !controlled,
    followCamera: followCamera ?? controlled,
  };
}

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

export function runProgrammaticMove(
  map: {
    once: (event: "moveend", listener: () => void) => unknown;
    off: (event: "moveend", listener: () => void) => unknown;
  },
  programmatic: { current: boolean },
  move: () => void,
  onComplete?: () => void,
  fallbackMs?: number,
) {
  let fallback: ReturnType<typeof setTimeout> | null = null;
  let finished = false;
  const cancel = () => {
    if (finished) return;
    finished = true;
    if (fallback !== null) clearTimeout(fallback);
    fallback = null;
    map.off("moveend", finish);
    programmatic.current = false;
  };
  const finish = () => {
    if (finished) return;
    cancel();
    onComplete?.();
  };
  programmatic.current = true;
  map.once("moveend", finish);
  if (fallbackMs !== undefined) fallback = setTimeout(cancel, fallbackMs);
  move();
  return cancel;
}

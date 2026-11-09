import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Camera } from "@earth-stories/story-schema";
import {
  cameraCommand,
  prefersReducedMotion,
  runProgrammaticMove,
} from "./mapCamera.js";

export function useMapCamera({
  map,
  camera,
  transition,
  enabled,
  navigationKey,
}: {
  map: MapLibreMap | null;
  camera: Camera;
  transition: "fly-to" | "instant";
  enabled: boolean;
  navigationKey?: string;
}) {
  const applied = useRef<string | null>(null);
  const previousNavigationKey = useRef(navigationKey);
  const programmatic = useRef(false);

  useEffect(() => {
    if (!map || !enabled) return;
    const changedChapter = previousNavigationKey.current !== navigationKey;
    previousNavigationKey.current = navigationKey;
    const signature = [
      camera.center[0],
      camera.center[1],
      camera.zoom,
      camera.bearing,
      camera.pitch,
    ].join(",");
    if (applied.current === null) {
      const center = map.getCenter();
      applied.current = [
        center.lng,
        center.lat,
        map.getZoom(),
        map.getBearing(),
        map.getPitch(),
      ].join(",");
    }
    if (applied.current === signature && !changedChapter) return;
    applied.current = signature;
    const command = cameraCommand(camera, transition, prefersReducedMotion());
    map.stop();
    return runProgrammaticMove(map, programmatic, () => {
      map[command.method](command.options);
    });
  }, [
    camera.center[0],
    camera.center[1],
    camera.zoom,
    camera.bearing,
    camera.pitch,
    enabled,
    map,
    transition,
    navigationKey,
  ]);

  return programmatic;
}

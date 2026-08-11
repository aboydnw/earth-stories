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
}: {
  map: MapLibreMap | null;
  camera: Camera;
  transition: "fly-to" | "instant";
  enabled: boolean;
}) {
  const applied = useRef<string | null>(null);
  const programmatic = useRef(false);

  useEffect(() => {
    if (!map || !enabled) return;
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
    if (applied.current === signature) return;
    applied.current = signature;
    const command = cameraCommand(camera, transition, prefersReducedMotion());
    return runProgrammaticMove(map, programmatic, () => {
      map.stop();
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
  ]);

  return programmatic;
}

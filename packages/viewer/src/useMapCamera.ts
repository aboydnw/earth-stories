import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Camera } from "@earth-stories/story-schema";
import { cameraCommand, prefersReducedMotion } from "./mapCamera.js";

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
  const initialized = useRef(false);
  const programmatic = useRef(false);

  useEffect(() => {
    if (!map || !enabled) return;
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    const command = cameraCommand(camera, transition, prefersReducedMotion());
    map.stop();
    programmatic.current = true;
    map[command.method](command.options);
    if (command.method === "jumpTo") programmatic.current = false;
    const finish = () => {
      programmatic.current = false;
    };
    map.once("moveend", finish);
    return () => {
      map.off("moveend", finish);
    };
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

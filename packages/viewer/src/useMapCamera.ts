import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { AtlasMotionState } from "./AtlasMotionContext.js";
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
  motion = null,
}: {
  map: MapLibreMap | null;
  camera: Camera;
  transition: "fly-to" | "instant";
  enabled: boolean;
  navigationKey?: string;
  motion?: AtlasMotionState | null;
}) {
  const applied = useRef<string | null>(null);
  const previousNavigationKey = useRef(navigationKey);
  const programmatic = useRef(false);
  const atlasMove = useRef<{ start: Camera; target: Camera } | null>(null);
  const atlas = motion !== null;

  useEffect(() => {
    if (!atlas || !map || !enabled) return;
    const center = map.getCenter();
    atlasMove.current = {
      start: {
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      },
      target: camera,
    };
    map.stop();
    return () => {
      atlasMove.current = null;
      programmatic.current = false;
      map.stop();
    };
  }, [
    atlas,
    map,
    enabled,
    navigationKey,
    motion?.chapterKey,
    camera.center[0],
    camera.center[1],
    camera.zoom,
    camera.bearing,
    camera.pitch,
  ]);

  useEffect(() => {
    const move = atlasMove.current;
    if (!motion || !map || !enabled || !move) return;
    // The capture handler stopped authored motion before MapLibre received
    // the gesture. Do not cancel a reader-started zoom/ease in this effect.
    if (motion.interrupted) return;
    const progress = transition === "instant" ? 1 : motion.easedProgress;
    const blend = (from: number, to: number) => from + (to - from) * progress;
    // Take the short route across the date line and through compass north.
    const angular = (from: number, to: number) =>
      from + (((((to - from) % 360) + 540) % 360) - 180) * progress;
    programmatic.current = true;
    try {
      map.jumpTo({
        center: [
          angular(move.start.center[0], move.target.center[0]),
          blend(move.start.center[1], move.target.center[1]),
        ],
        zoom: blend(move.start.zoom, move.target.zoom),
        bearing: angular(move.start.bearing, move.target.bearing),
        pitch: blend(move.start.pitch, move.target.pitch),
      });
    } finally {
      programmatic.current = false;
    }
  }, [
    map,
    enabled,
    transition,
    navigationKey,
    motion?.chapterKey,
    motion?.easedProgress,
    motion?.interrupted,
    camera.center[0],
    camera.center[1],
    camera.zoom,
    camera.bearing,
    camera.pitch,
  ]);

  useEffect(() => {
    if (atlas || !map || !enabled) return;
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
    atlas,
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

import { useEffect, useMemo, useState } from "react";
import { TripsLayer } from "@deck.gl/geo-layers";
import type { PublicationAsset } from "@earth-stories/story-schema";
import { DeckOverlay } from "./DeckOverlay.js";
import { geoJsonBounds } from "./geoBounds.js";
import { timestampAtPosition } from "./temporal.js";

interface Track {
  path: [number, number][];
  timestamps: number[];
}

export function TrajectoryOverlay({
  asset,
  position,
  onError,
  onBounds,
  onTimeBounds,
  onReady,
}: {
  asset: PublicationAsset;
  position: number;
  onError: (message: string) => void;
  onBounds?: (bounds: [number, number, number, number]) => void;
  onTimeBounds: (bounds: [number, number] | null) => void;
  onReady?: () => void;
}) {
  const [tracks, setTracks] = useState<Track[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetch(asset.href, { signal: controller.signal })
      .then((response) => {
        if (!response.ok)
          throw new Error(`The trajectory source returned ${response.status}.`);
        return response.json();
      })
      .then((data: { tracks?: Track[] }) => {
        if (!active) return;
        const valid = (data.tracks ?? []).flatMap((track) => {
          const length = Math.min(
            track.path?.length ?? 0,
            track.timestamps?.length ?? 0,
          );
          if (length < 2) return [];
          const path = track.path.slice(0, length);
          const timestamps = track.timestamps.slice(0, length).map(Number);
          return timestamps.every(Number.isFinite)
            ? [{ path, timestamps }]
            : [];
        });
        setTracks(valid);
        let minimum = Infinity;
        let maximum = -Infinity;
        for (const track of valid) {
          for (const time of track.timestamps) {
            minimum = Math.min(minimum, time);
            maximum = Math.max(maximum, time);
          }
        }
        onTimeBounds(
          Number.isFinite(minimum) && maximum > minimum
            ? [minimum, maximum]
            : null,
        );
        const featureCollection: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: valid.map((track) => ({
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: track.path },
          })),
        };
        const bounds = geoJsonBounds(featureCollection);
        if (bounds) onBounds?.(bounds);
        onReady?.();
      })
      .catch((cause: unknown) => {
        if (active && cause instanceof Error && cause.name !== "AbortError")
          onError(cause.message);
      });
    return () => {
      active = false;
      controller.abort();
      onTimeBounds(null);
    };
  }, [asset.href, onBounds, onError, onReady, onTimeBounds]);

  const timeBounds = useMemo(() => {
    let minimum = Infinity;
    let maximum = -Infinity;
    for (const track of tracks)
      for (const time of track.timestamps) {
        minimum = Math.min(minimum, time);
        maximum = Math.max(maximum, time);
      }
    return { minimum, maximum };
  }, [tracks]);
  const layers = useMemo(() => {
    if (!tracks.length) return [];
    const { minimum, maximum } = timeBounds;
    return [
      new TripsLayer<Track>({
        id: `${asset.id}-trajectory`,
        data: tracks,
        getPath: (track) => track.path,
        getTimestamps: (track) => track.timestamps,
        getColor: asset.presentation.color
          .match(/[a-f\d]{2}/gi)
          ?.map((part) => parseInt(part, 16)) as [number, number, number],
        currentTime: timestampAtPosition(position, minimum, maximum),
        trailLength:
          (asset.trajectory?.trailLength ?? 600) *
          (Math.abs(maximum) >= 100_000_000_000 ? 1000 : 1),
        widthMinPixels: 4,
        opacity: asset.presentation.opacity,
        capRounded: true,
        jointRounded: true,
        fadeTrail: true,
      }),
    ];
  }, [asset, position, timeBounds, tracks]);
  return <DeckOverlay layers={layers} />;
}

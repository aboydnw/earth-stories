import { useEffect, useMemo, useState } from "react";
import { TripsLayer } from "@deck.gl/geo-layers";
import { PathLayer } from "@deck.gl/layers";
import type { PublicationAsset } from "@earth-stories/story-schema";
import { DeckOverlay } from "./DeckOverlay.js";
import { geoJsonBounds } from "./geoBounds.js";
import { timestampAtPosition } from "./temporal.js";

export interface Track {
  path: [number, number][];
  timestamps: number[] | null;
}

export function normalizeTracks(tracks: Track[]) {
  return tracks.reduce<Track[]>((result, track) => {
    if (!Array.isArray(track.path) || track.path.length < 2) return result;
    if (!Array.isArray(track.timestamps) || !track.timestamps.length) {
      result.push({ path: track.path, timestamps: null });
      return result;
    }
    const length = Math.min(track.path.length, track.timestamps.length);
    if (length < 2) return result;
    const timestamps = track.timestamps.slice(0, length).map(Number);
    if (timestamps.every(Number.isFinite))
      result.push({ path: track.path.slice(0, length), timestamps });
    return result;
  }, []);
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
        const valid = normalizeTracks(data.tracks ?? []);
        setTracks(valid);
        let minimum = Infinity;
        let maximum = -Infinity;
        for (const track of valid) {
          for (const time of track.timestamps ?? []) {
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
      for (const time of track.timestamps ?? []) {
        minimum = Math.min(minimum, time);
        maximum = Math.max(maximum, time);
      }
    return { minimum, maximum };
  }, [tracks]);
  const layers = useMemo(() => {
    if (!tracks.length) return [];
    const { minimum, maximum } = timeBounds;
    const color = asset.presentation.color
      .match(/[a-f\d]{2}/gi)
      ?.map((part) => parseInt(part, 16)) as [number, number, number];
    const timedTracks = tracks.filter(
      (track): track is Track & { timestamps: number[] } =>
        track.timestamps !== null,
    );
    const staticTracks = tracks.filter((track) => track.timestamps === null);
    return [
      ...(staticTracks.length
        ? [
            new PathLayer<Track>({
              id: `${asset.id}-trajectory-static`,
              data: staticTracks,
              getPath: (track) => track.path,
              getColor: color,
              widthMinPixels: 4,
              opacity: asset.presentation.opacity,
              capRounded: true,
              jointRounded: true,
            }),
          ]
        : []),
      ...(timedTracks.length && Number.isFinite(minimum) && maximum > minimum
        ? [
            new TripsLayer<Track & { timestamps: number[] }>({
              id: `${asset.id}-trajectory`,
              data: timedTracks,
              getPath: (track) => track.path,
              getTimestamps: (track) => track.timestamps,
              getColor: color,
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
          ]
        : []),
    ];
  }, [asset, position, timeBounds, tracks]);
  return <DeckOverlay layers={layers} />;
}

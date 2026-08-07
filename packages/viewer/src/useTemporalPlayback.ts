import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampTemporalPosition,
  timestepIndex,
  timestepPosition,
} from "./temporal.js";

const TRAVERSAL_SECONDS = 12;

export function useTemporalPlayback({
  assetId,
  chapterId,
  authoredPosition,
  stepCount,
  enabled,
}: {
  assetId: string | null;
  chapterId: string;
  authoredPosition?: number;
  stepCount?: number;
  enabled: boolean;
}) {
  const [position, setPositionState] = useState(() =>
    clampTemporalPosition(authoredPosition ?? 0),
  );
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const previousAsset = useRef(assetId);
  const currentPosition = useRef(position);
  currentPosition.current = position;

  useEffect(() => {
    const changedAsset = previousAsset.current !== assetId;
    previousAsset.current = assetId;
    if (!changedAsset && authoredPosition === undefined) return;
    const target = clampTemporalPosition(authoredPosition ?? 0);
    setPlaying(false);
    if (
      changedAsset ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setPositionState(target);
      return;
    }
    const start = currentPosition.current;
    const started = performance.now();
    let frame = 0;
    const transition = (now: number) => {
      const progress = Math.min(1, (now - started) / 650);
      const eased = 1 - Math.pow(1 - progress, 3);
      setPositionState(start + (target - start) * eased);
      if (progress < 1) frame = requestAnimationFrame(transition);
    };
    frame = requestAnimationFrame(transition);
    return () => cancelAnimationFrame(frame);
  }, [assetId, authoredPosition, chapterId]);

  useEffect(() => {
    if (!enabled) setPlaying(false);
  }, [enabled]);

  useEffect(() => {
    if (!playing || !enabled) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) {
      setPlaying(false);
      return;
    }
    const pauseForReducedMotion = (event: MediaQueryListEvent) => {
      if (event.matches) setPlaying(false);
    };
    let frame = 0;
    let previous: number | null = null;
    const tick = (now: number) => {
      const elapsed = previous === null ? 0 : (now - previous) / 1000;
      previous = now;
      setPositionState((current) => {
        const next = current + (elapsed * speed) / TRAVERSAL_SECONDS;
        return next >= 1 ? next % 1 : next;
      });
      frame = requestAnimationFrame(tick);
    };
    const pauseForVisibility = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pauseForVisibility);
    reducedMotion.addEventListener("change", pauseForReducedMotion);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", pauseForVisibility);
      reducedMotion.removeEventListener("change", pauseForReducedMotion);
    };
  }, [enabled, playing, speed]);

  const scrub = useCallback((next: number) => {
    setPositionState(clampTemporalPosition(next));
    setPlaying(false);
  }, []);
  const step = useCallback(
    (offset: number) => {
      if (!stepCount || stepCount < 2) return;
      const next = Math.max(
        0,
        Math.min(stepCount - 1, timestepIndex(position, stepCount) + offset),
      );
      scrub(timestepPosition(next, stepCount));
    },
    [position, scrub, stepCount],
  );

  return {
    position,
    playing,
    speed,
    scrub,
    step,
    setSpeed,
    toggle: () => setPlaying((value) => !value),
  };
}

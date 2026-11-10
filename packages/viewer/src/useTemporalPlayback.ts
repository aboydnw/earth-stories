import { useCallback, useEffect, useRef, useState } from "react";
import type { AtlasMotionState } from "./AtlasMotionContext.js";
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
  motion = null,
}: {
  assetId: string | null;
  chapterId: string;
  authoredPosition?: number;
  stepCount?: number;
  enabled: boolean;
  motion?: AtlasMotionState | null;
}) {
  const [position, setPositionState] = useState(() =>
    clampTemporalPosition(authoredPosition ?? 0),
  );
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const previousAsset = useRef(assetId);
  const currentPosition = useRef(position);
  currentPosition.current = position;
  const atlas = motion !== null;
  const playbackAllowed =
    enabled &&
    (!motion ||
      (motion.enabled &&
        !motion.paused &&
        !motion.reducedMotion &&
        !motion.suspended));
  const authoredMove = useRef({
    assetId,
    chapterId,
    authoredPosition,
    start: position,
    target: position,
    animate: false,
  });

  useEffect(() => {
    if (!atlas) return;
    const previous = authoredMove.current;
    if (
      previous.assetId === assetId &&
      previous.chapterId === chapterId &&
      previous.authoredPosition === authoredPosition
    )
      return;
    const changedAsset = previous.assetId !== assetId;
    const target = clampTemporalPosition(
      authoredPosition ?? (changedAsset ? 0 : currentPosition.current),
    );
    authoredMove.current = {
      assetId,
      chapterId,
      authoredPosition,
      start: currentPosition.current,
      target,
      animate: !changedAsset && authoredPosition !== undefined,
    };
    setPlaying(false);
    if (changedAsset) setPositionState(target);
  }, [atlas, assetId, chapterId, authoredPosition]);

  useEffect(() => {
    if (!motion || motion.interrupted) return;
    const move = authoredMove.current;
    if (!move.animate) return;
    setPositionState(
      move.start + (move.target - move.start) * motion.easedProgress,
    );
  }, [
    assetId,
    chapterId,
    authoredPosition,
    motion?.easedProgress,
    motion?.interrupted,
  ]);

  useEffect(() => {
    if (atlas) return;
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
  }, [atlas, assetId, authoredPosition, chapterId]);

  useEffect(() => {
    if (!playbackAllowed) setPlaying(false);
  }, [playbackAllowed]);

  useEffect(() => {
    if (!playing || !playbackAllowed) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) {
      setPlaying(false);
      return;
    }
    const pauseForReducedMotion = (event: MediaQueryListEvent) => {
      if (event.matches) setPlaying(false);
    };
    const pauseForVisibility = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pauseForVisibility);
    reducedMotion.addEventListener("change", pauseForReducedMotion);
    if (stepCount && stepCount > 1) {
      const interval = window.setInterval(() => {
        setPositionState((current) => {
          const currentIndex = timestepIndex(current, stepCount);
          return timestepPosition((currentIndex + 1) % stepCount, stepCount);
        });
      }, 800 / speed);
      return () => {
        window.clearInterval(interval);
        document.removeEventListener("visibilitychange", pauseForVisibility);
        reducedMotion.removeEventListener("change", pauseForReducedMotion);
      };
    }
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
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", pauseForVisibility);
      reducedMotion.removeEventListener("change", pauseForReducedMotion);
    };
  }, [playbackAllowed, playing, speed, stepCount]);

  const interrupt = motion?.interrupt;
  const scrub = useCallback(
    (next: number) => {
      interrupt?.();
      setPositionState(clampTemporalPosition(next));
      setPlaying(false);
    },
    [interrupt],
  );
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
    playDisabled: !playbackAllowed,
    speed,
    scrub,
    step,
    setSpeed,
    toggle: () => {
      if (motion && !playbackAllowed) return;
      interrupt?.();
      setPlaying((value) => !value);
    },
  };
}

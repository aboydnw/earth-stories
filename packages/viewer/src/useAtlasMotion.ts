import { useCallback, useEffect, useRef, useState } from "react";
import type { AtlasMotionState } from "./AtlasMotionContext.js";
import { prefersReducedMotion } from "./mapCamera.js";

export const ATLAS_TRANSITION_MS = 1_600;

export function atlasEase(progress: number) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

/** One interruptible clock for the atlas camera, recorded time and annotation. */
export function useAtlasMotion({
  chapterKey,
  active = true,
}: {
  chapterKey: string;
  active?: boolean;
}): AtlasMotionState {
  const [enabled, setEnabledState] = useState(true);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [suspended, setSuspended] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );
  const [clock, setClock] = useState({
    chapterKey,
    active,
    progress: 1,
    interrupted: false,
  });
  const generation = useRef(0);
  const allowed = active && enabled && !reducedMotion;

  // Derive a new chapter before children render. A stale completed frame must
  // never snap the camera to the new target before its transition begins.
  let current = clock;
  if (clock.chapterKey !== chapterKey || clock.active !== active) {
    current = {
      chapterKey,
      active,
      progress: clock.active === active && allowed ? 0 : 1,
      interrupted: false,
    };
    setClock(current);
  } else if (!allowed && clock.progress < 1) {
    current = { ...clock, progress: 1 };
    setClock(current);
  }
  const transitioning = current.progress < 1 && !current.interrupted;
  const running = transitioning && allowed && !paused && !suspended;

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const changeMotion = () => setReducedMotion(media?.matches ?? false);
    const changeVisibility = () => setSuspended(document.hidden);
    media?.addEventListener("change", changeMotion);
    document.addEventListener("visibilitychange", changeVisibility);
    return () => {
      media?.removeEventListener("change", changeMotion);
      document.removeEventListener("visibilitychange", changeVisibility);
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const token = ++generation.current;
    const started = performance.now();
    const from = current.progress;
    let frame = 0;
    const tick = (now: number) => {
      if (token !== generation.current) return;
      const progress = Math.min(
        1,
        from + Math.max(0, now - started) / ATLAS_TRANSITION_MS,
      );
      setClock((previous) =>
        previous.chapterKey === chapterKey
          ? { ...previous, progress }
          : previous,
      );
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      generation.current += 1;
      cancelAnimationFrame(frame);
    };
    // The starting progress is captured once per run, not once per frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterKey, running]);

  const pause = useCallback(() => {
    generation.current += 1;
    setPaused(true);
  }, []);
  const resume = useCallback(() => setPaused(false), []);
  const skip = useCallback(() => {
    generation.current += 1;
    setClock((previous) => ({ ...previous, progress: 1, interrupted: false }));
  }, []);
  const setEnabled = useCallback((value: boolean) => {
    if (!value) generation.current += 1;
    setEnabledState(value);
  }, []);
  const interrupt = useCallback(() => {
    generation.current += 1;
    setClock((previous) => ({ ...previous, progress: 1, interrupted: true }));
  }, []);

  return {
    chapterKey,
    active,
    progress: current.progress,
    easedProgress: atlasEase(current.progress),
    enabled,
    reducedMotion,
    paused,
    suspended,
    transitioning,
    running,
    interrupted: current.interrupted,
    pause,
    resume,
    skip,
    setEnabled,
    interrupt,
  };
}

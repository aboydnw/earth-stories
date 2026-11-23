import { useEffect, useRef, useState, type ReactNode } from "react";
import type { VisualAccent } from "@earth-stories/story-schema";
import { SceneCanvas } from "./SceneCanvas.js";
import "./chapterVisualAccent.css";

/** Reserved document space: companion art never overlays the data viewport. */
export function ChapterVisualContent({
  accent,
  snapshotMode = false,
  children,
}: {
  accent?: VisualAccent;
  snapshotMode?: boolean;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(accent?.scene.staticProgress ?? 0.5);
  useEffect(() => {
    const element = root.current;
    if (!element || !accent) return;
    const media = window.matchMedia?.(
      "(prefers-reduced-motion: reduce), print",
    );
    let parent = element.parentElement;
    while (parent && !/(auto|scroll)/.test(getComputedStyle(parent).overflowY))
      parent = parent.parentElement;
    const scrollport = parent,
      target = scrollport ?? window;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (snapshotMode || media?.matches) {
        setProgress(accent.scene.staticProgress);
        return;
      }
      const height = scrollport?.clientHeight ?? window.innerHeight;
      const top = scrollport?.getBoundingClientRect().top ?? 0;
      const rect = element.getBoundingClientRect();
      setProgress(
        Math.max(
          0,
          Math.min(
            1,
            (top + height - rect.top) / Math.max(1, height + rect.height),
          ),
        ),
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    target.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    media?.addEventListener("change", schedule);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedule);
    observer?.observe(element);
    if (scrollport) observer?.observe(scrollport);
    update();
    return () => {
      target.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      media?.removeEventListener("change", schedule);
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [accent, snapshotMode]);
  if (!accent) return <>{children}</>;
  const art = <ChapterVisualAccent accent={accent} progress={progress} />;
  return (
    <div
      ref={root}
      className={`story-accent-layout story-accent-layout--${accent.placement}`}
      data-visual-accent={accent.id}
    >
      {accent.placement === "leading" ? art : null}
      <div className="story-accent-copy">{children}</div>
      {accent.placement !== "leading" ? art : null}
    </div>
  );
}
export function ChapterVisualAccent({
  accent,
  progress,
}: {
  accent: VisualAccent;
  progress: number;
}) {
  return (
    <figure className="story-accent-art">
      <SceneCanvas scene={accent.scene} progress={progress} alt={accent.alt} />
    </figure>
  );
}

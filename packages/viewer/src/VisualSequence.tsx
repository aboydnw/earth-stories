import { useEffect, useRef, useState, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import type {
  PublicationChapter,
  PublicationAsset,
  VisualSequence as Sequence,
} from "@earth-stories/story-schema";
import { IllustratedChapter } from "./IllustratedChapter.js";
import { SceneCanvas } from "./SceneCanvas.js";
import "./visualSequence.css";

/** An HTML narrative over one continuous vector scene, using the actual scrollport. */
export function VisualSequence({
  sequence,
  chapters,
  snapshotMode = false,
  focusedChapterId,
  assets = new Map(),
}: {
  sequence: Sequence;
  chapters: PublicationChapter[];
  assets?: Map<string, PublicationAsset>;
  snapshotMode?: boolean;
  focusedChapterId?: string;
}) {
  const root = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(sequence.scene.staticProgress);
  const [reduced, setReduced] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  useEffect(() => setScrub(null), [focusedChapterId, sequence.id]);
  useEffect(() => {
    const media = window.matchMedia?.(
      "(prefers-reduced-motion: reduce), print",
    );
    if (!media) return;
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const element = root.current;
    if (!element || snapshotMode || reduced || focusedChapterId) return;
    let parent = element.parentElement;
    while (parent && !/(auto|scroll)/.test(getComputedStyle(parent).overflowY))
      parent = parent.parentElement;
    const scrollport = parent,
      target = scrollport ?? window;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = scrollport?.getBoundingClientRect().top ?? 0;
      const height = scrollport?.clientHeight ?? window.innerHeight;
      element.style.setProperty("--visual-viewport", `${height}px`);
      const steps = Array.from(
        element.querySelectorAll<HTMLElement>("[data-visual-step]"),
      );
      // The middle of the viewport progresses continuously through each narrative step.
      const anchor = top + height * 0.5;
      let value = 0;
      steps.forEach((node, i) => {
        const rect = node.getBoundingClientRect(),
          step = sequence.steps[i]!;
        const start = rect.top + (i === 0 ? height * 0.5 : 0);
        const end =
          rect.top + rect.height - (i === steps.length - 1 ? height * 0.5 : 0);
        if (anchor >= start)
          value =
            step.start +
            (step.end - step.start) *
              Math.max(
                0,
                Math.min(1, (anchor - start) / Math.max(1, end - start)),
              );
      });
      setProgress(value);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    target.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
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
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sequence, snapshotMode, reduced, focusedChapterId]);
  const staticMode = snapshotMode || reduced || Boolean(focusedChapterId);
  const steps = sequence.steps.filter(
    (s) => !focusedChapterId || s.chapterId === focusedChapterId,
  );
  const narrative = (id: string) => {
    const chapter = chapters.find((c) => c.id === id);
    const step = sequence.steps.find((s) => s.chapterId === id)!;
    const current = focusedChapterId
      ? (scrub ??
        Math.max(step.start, Math.min(step.end, sequence.scene.staticProgress)))
      : progress;
    return chapter ? (
      <div className="story-visual__copy">
        <h2>{chapter.title}</h2>
        {chapter.type === "illustrated" ? (
          <IllustratedChapter
            chapter={chapter}
            assets={assets}
            snapshotMode={snapshotMode || reduced}
            previewProgress={Math.max(
              0,
              Math.min(1, (current - step.start) / (step.end - step.start)),
            )}
          />
        ) : null}
        <ReactMarkdown>{chapter.narrative}</ReactMarkdown>
      </div>
    ) : null;
  };
  return (
    <section
      ref={root}
      className={`story-visual${staticMode ? " story-visual--static" : ""}`}
      aria-label={sequence.alt}
    >
      {staticMode ? (
        steps.map((step) => (
          <section
            key={step.chapterId}
            id={step.chapterId}
            data-chapter-id={step.chapterId}
            className="story-visual__still"
          >
            <SceneCanvas
              scene={sequence.scene}
              progress={
                focusedChapterId && !reduced
                  ? (scrub ??
                    Math.max(
                      step.start,
                      Math.min(step.end, sequence.scene.staticProgress),
                    ))
                  : Math.max(
                      step.start,
                      Math.min(step.end, sequence.scene.staticProgress),
                    )
              }
              alt={sequence.alt}
              className="story-visual__canvas"
            />
            {narrative(step.chapterId)}
          </section>
        ))
      ) : (
        <>
          <div className="story-visual__stage">
            <SceneCanvas
              scene={sequence.scene}
              immersive
              progress={progress}
              alt={sequence.alt}
              className="story-visual__canvas"
            />
          </div>
          <div className="story-visual__steps">
            {steps.map((step, index) => (
              <section
                key={step.chapterId}
                id={step.chapterId}
                data-chapter-id={step.chapterId}
                data-visual-step
                className="story-visual__step"
                style={
                  {
                    "--visual-step-height": `calc(var(--visual-viewport, 100dvh) * ${sequence.scene.scrollLength * (step.end - step.start) + (index === 0 ? 0.5 : 0) + (index === steps.length - 1 ? 0.5 : 0)})`,
                  } as CSSProperties
                }
              >
                {narrative(step.chapterId)}
              </section>
            ))}
          </div>
        </>
      )}
      {focusedChapterId && !snapshotMode && !reduced ? (
        <label className="story-illustration__scrubber">
          Scene preview
          <input
            aria-label="Scene preview"
            type="range"
            min={steps[0]?.start ?? 0}
            max={steps[0]?.end ?? 1}
            step="0.001"
            value={
              scrub ??
              Math.max(
                steps[0]?.start ?? 0,
                Math.min(steps[0]?.end ?? 1, sequence.scene.staticProgress),
              )
            }
            onChange={(e) => setScrub(Number(e.target.value))}
          />
        </label>
      ) : null}
      {sequence.caption ? (
        <p className="story-visual__caption">{sequence.caption}</p>
      ) : null}
    </section>
  );
}

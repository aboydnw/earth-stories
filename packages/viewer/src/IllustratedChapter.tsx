import { useEffect, useRef, useState } from "react";
import type {
  PublicationAsset,
  PublicationChapter,
} from "@earth-stories/story-schema";
import { SceneCanvas } from "./SceneCanvas.js";
import "./illustrated.css";

type Illustrated = Extract<PublicationChapter, { type: "illustrated" }>;
export function sceneScrollProgress(
  top: number,
  height: number,
  viewportTop: number,
  viewportHeight: number,
): number {
  return Math.max(
    0,
    Math.min(1, (viewportTop - top) / Math.max(1, height - viewportHeight)),
  );
}
export function IllustratedChapter({
  chapter,
  assets,
  snapshotMode = false,
  previewProgress,
  focused = false,
}: {
  chapter: Illustrated;
  assets: Map<string, PublicationAsset>;
  snapshotMode?: boolean;
  previewProgress?: number;
  focused?: boolean;
}) {
  const { scene } = chapter;
  const root = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(scene.staticProgress);
  const [scrub, setScrub] = useState(scene.staticProgress);
  const [failedImages, setFailedImages] = useState<Set<string>>(
    () => new Set(),
  );
  const [reduced, setReduced] = useState(
    () =>
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce), print").matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const media = matchMedia("(prefers-reduced-motion: reduce), print");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const element = root.current;
    if (
      !element ||
      snapshotMode ||
      reduced ||
      focused ||
      previewProgress !== undefined
    )
      return;
    let parent = element.parentElement;
    while (parent && !/(auto|scroll)/.test(getComputedStyle(parent).overflowY))
      parent = parent.parentElement;
    const scrollport = parent;
    const target = scrollport ?? window;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      setProgress(
        sceneScrollProgress(
          rect.top,
          rect.height,
          scrollport?.getBoundingClientRect().top ?? 0,
          scrollport?.clientHeight ?? window.innerHeight,
        ),
      );
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
  }, [scene, snapshotMode, reduced, focused, previewProgress]);
  const staticMode = snapshotMode || reduced;
  const missing = scene.layers.filter(
    (l) =>
      l.kind === "image" &&
      (!assets.get(l.assetId) || failedImages.has(assets.get(l.assetId)!.href)),
  );
  return (
    <figure className="story-illustration" data-scene-id={chapter.id}>
      <div
        ref={root}
        className={`story-illustration__track${staticMode || focused || previewProgress !== undefined ? " story-illustration__track--static" : ""}`}
        style={{
          minHeight:
            staticMode || focused || previewProgress !== undefined
              ? undefined
              : `${(scene.scrollLength + 1) * 100}dvh`,
        }}
      >
        <SceneCanvas
          scene={scene}
          progress={
            staticMode
              ? scene.staticProgress
              : (previewProgress ?? (focused ? scrub : progress))
          }
          alt={chapter.alt || chapter.title}
          assets={assets}
          onImageError={(href) =>
            setFailedImages((current) => new Set(current).add(href))
          }
        />
      </div>
      {missing.map((l) => (
        <p role="status" key={l.id}>
          Artwork unavailable: {l.kind === "image" ? l.alt : ""}
        </p>
      ))}
      {chapter.caption ? <figcaption>{chapter.caption}</figcaption> : null}
      {focused && !snapshotMode ? (
        <label className="story-illustration__scrubber">
          Scene preview
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={reduced ? scene.staticProgress : scrub}
            disabled={reduced}
            onChange={(e) => setScrub(Number(e.target.value))}
          />
          {reduced ? (
            <span>
              Showing the still frame because reduced motion is enabled.
            </span>
          ) : null}
        </label>
      ) : null}
    </figure>
  );
}

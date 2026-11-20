import { useEffect, useId, useRef, useState } from "react";
import type {
  PublicationAsset,
  PublicationChapter,
} from "@earth-stories/story-schema";
import { sceneFrame } from "./sceneFrame.js";
import { paletteColor } from "./readerPalette.js";
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
  const uid = useId().replace(/:/g, "");
  const [progress, setProgress] = useState(scene.staticProgress);
  const [scrub, setScrub] = useState(scene.staticProgress);
  const [reduced, setReduced] = useState(
    () =>
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
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
  const frames = sceneFrame(
    scene,
    staticMode
      ? scene.staticProgress
      : (previewProgress ?? (focused ? scrub : progress)),
  );
  const missing = scene.layers.filter(
    (l) => l.kind === "image" && !assets.get(l.assetId),
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
        <svg
          className="story-illustration__canvas"
          viewBox={`0 0 ${scene.width} ${scene.height}`}
          role="img"
          aria-labelledby={`${uid}-title`}
          data-static-progress={scene.staticProgress}
        >
          <title id={`${uid}-title`}>{chapter.alt || chapter.title}</title>
          {scene.layers.map((layer, index) => {
            const frame = frames[index]!;
            const w = layer.width * scene.width,
              h = layer.height * scene.height;
            const clip = `${uid}-${index}`;
            return (
              <g
                key={layer.id}
                data-layer-id={layer.id}
                transform={`translate(${frame.x * scene.width} ${frame.y * scene.height}) scale(${frame.scale})`}
                opacity={frame.opacity}
              >
                <defs>
                  <clipPath id={clip}>
                    <rect width={w * frame.reveal} height={h} />
                  </clipPath>
                </defs>
                <g clipPath={`url(#${clip})`}>
                  {layer.kind === "image" && assets.get(layer.assetId) ? (
                    <image
                      href={assets.get(layer.assetId)!.href}
                      width={w}
                      height={h}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      <title>{layer.alt}</title>
                    </image>
                  ) : null}
                  {layer.kind === "text" ? (
                    <text
                      x={0}
                      y={layer.fontSize * scene.width}
                      fontSize={layer.fontSize * scene.width}
                      fill={paletteColor(layer.colorRole)}
                    >
                      {layer.text}
                    </text>
                  ) : null}
                  {layer.kind === "path" ? (
                    <path
                      d={layer.pathData}
                      transform={`scale(${w} ${h})`}
                      fill={
                        layer.fillRole ? paletteColor(layer.fillRole) : "none"
                      }
                      stroke={
                        layer.strokeRole
                          ? paletteColor(layer.strokeRole)
                          : "none"
                      }
                      strokeWidth={layer.strokeWidth}
                    />
                  ) : null}
                </g>
              </g>
            );
          })}
        </svg>
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

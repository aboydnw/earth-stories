import { useId, useEffect, useRef, useState } from "react";
import type {
  PublicationScene,
  PublicationAsset,
} from "@earth-stories/story-schema";
import { sceneFrame } from "./sceneFrame.js";
import { paletteColor } from "./readerPalette.js";
export function SceneCanvas({
  scene,
  progress,
  alt,
  assets = new Map(),
  onImageError,
  className,
  immersive = false,
}: {
  scene: PublicationScene;
  progress: number;
  alt: string;
  assets?: Map<string, PublicationAsset>;
  onImageError?: (href: string) => void;
  className?: string;
  immersive?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const frames = sceneFrame(scene, progress);
  const root = useRef<SVGSVGElement>(null);
  const [ratio, setRatio] = useState(scene.width / scene.height);
  useEffect(() => {
    const node = root.current;
    if (!node || !immersive) return;
    const update = () => {
      const r = node.getBoundingClientRect();
      if (r.width && r.height) setRatio(r.width / r.height);
    };
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(node);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [immersive]);
  const viewWidth = immersive
    ? Math.min(scene.width, scene.height * ratio)
    : scene.width;
  const viewHeight = immersive
    ? Math.min(scene.height, scene.width / ratio)
    : scene.height;
  const viewX = Math.max(
    0,
    Math.min(
      scene.width - viewWidth,
      scene.width * (scene.focalX ?? 0.7) - viewWidth / 2,
    ),
  );

  return (
    <svg
      ref={root}
      className={className ?? "story-illustration__canvas"}
      viewBox={`${viewX} ${(scene.height - viewHeight) / 2} ${viewWidth} ${viewHeight}`}
      role="img"
      aria-labelledby={`${uid}-title`}
      data-static-progress={scene.staticProgress}
    >
      <title id={`${uid}-title`}>{alt}</title>
      {scene.layers.map((layer, index) => {
        const frame = frames[index]!;
        const w = layer.width * scene.width,
          h = layer.height * scene.height;
        const clip = `${uid}-${index}`;
        return (
          <g
            key={layer.id}
            data-layer-id={layer.id}
            transform={`translate(${frame.x * scene.width} ${frame.y * scene.height}) scale(${frame.scale}) rotate(${frame.rotation ?? 0} ${w / 2} ${h / 2})`}
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
                  onError={() =>
                    onImageError?.(assets.get(layer.assetId)!.href)
                  }
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
                  style={{ fontSize: layer.fontSize * scene.width }}
                  fill={paletteColor(layer.colorRole)}
                >
                  {layer.text}
                </text>
              ) : null}
              {layer.kind === "path" ? (
                <path
                  d={layer.pathData}
                  transform={`scale(${w} ${h})`}
                  fill={layer.fillRole ? paletteColor(layer.fillRole) : "none"}
                  stroke={
                    layer.strokeRole ? paletteColor(layer.strokeRole) : "none"
                  }
                  strokeWidth={layer.strokeWidth}
                />
              ) : null}
            </g>
          </g>
        );
      })}
    </svg>
  );
}

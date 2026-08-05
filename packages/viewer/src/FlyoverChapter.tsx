import { useEffect, useRef, useState } from "react";
import type {
  Camera,
  PublicationAsset,
  PublicationChapter,
} from "@earth-stories/story-schema";
import { MapChapter } from "./MapChapter.js";

interface Props {
  chapter: Extract<PublicationChapter, { type: "flyover" }>;
  asset: PublicationAsset | null;
  overlayAssets: PublicationAsset[];
  basemapStyle: string;
}

const interpolate = (a: Camera, b: Camera, amount: number): Camera => ({
  center: [
    a.center[0] + (b.center[0] - a.center[0]) * amount,
    a.center[1] + (b.center[1] - a.center[1]) * amount,
  ],
  zoom: a.zoom + (b.zoom - a.zoom) * amount,
  bearing: a.bearing + (b.bearing - a.bearing) * amount,
  pitch: a.pitch + (b.pitch - a.pitch) * amount,
  terrain: amount < 0.5 ? a.terrain : b.terrain,
  globe: amount < 0.5 ? a.globe : b.globe,
  buildings: amount < 0.5 ? a.buildings : b.buildings,
});

export function FlyoverChapter({
  chapter,
  asset,
  overlayAssets,
  basemapStyle,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const update = () => {
      const node = container.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const distance = Math.max(1, rect.height - window.innerHeight);
      setProgress(Math.max(0, Math.min(1, -rect.top / distance)));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  const scaled = progress * (chapter.keyframes.length - 1);
  const index = Math.min(chapter.keyframes.length - 2, Math.floor(scaled));
  const camera = interpolate(
    chapter.keyframes[index]!,
    chapter.keyframes[index + 1]!,
    scaled - index,
  );
  const mapChapter = {
    ...chapter,
    type: "map" as const,
    camera,
    assetId: chapter.assetId ?? "",
    transition: "instant" as const,
  };
  return (
    <div
      ref={container}
      className="story-flyover"
      style={{
        height: `${Math.max(120, chapter.scrollLength * 100 * (chapter.keyframes.length - 1) + 100)}vh`,
      }}
    >
      <div className="story-flyover__sticky">
        <MapChapter
          chapter={mapChapter}
          asset={asset}
          overlayAssets={overlayAssets}
          basemapStyle={basemapStyle}
          controlled
        />
        <div
          className="story-flyover__progress"
          aria-label={`Flyover ${Math.round(progress * 100)}% complete`}
        >
          <span style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

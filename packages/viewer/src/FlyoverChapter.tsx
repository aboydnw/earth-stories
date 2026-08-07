import { useCallback, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type {
  Camera,
  PublicationAsset,
  PublicationChapter,
} from "@earth-stories/story-schema";
import { MapChapter } from "./MapChapter.js";
import { interpolateFlyover } from "./flyover.js";
import { useFlyoverScroll } from "./useFlyoverScroll.js";

interface Props {
  chapter: Extract<PublicationChapter, { type: "flyover" }>;
  asset: PublicationAsset | null;
  overlayAssets: PublicationAsset[];
  basemapStyle: string;
  snapshotMode?: boolean;
  onCameraChange?: (camera: Camera) => void;
}

export function FlyoverChapter({
  chapter,
  asset,
  overlayAssets,
  basemapStyle,
  snapshotMode = false,
  onCameraChange,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [progress, setProgress] = useState(0);
  const handleMapReady = useCallback((instance: MapLibreMap | null) => {
    map.current = instance;
  }, []);
  const update = useCallback(
    (nextProgress: number) => {
      const camera = interpolateFlyover(chapter.keyframes, nextProgress);
      if (!camera) return;
      map.current?.jumpTo({
        center: camera.center,
        zoom: camera.zoom,
        bearing: camera.bearing,
        pitch: camera.pitch,
      });
      onCameraChange?.(camera);
      setProgress((current) => {
        const quantized = Math.round(nextProgress * 1_000) / 1_000;
        return current === quantized ? current : quantized;
      });
    },
    [chapter.keyframes, onCameraChange],
  );
  useFlyoverScroll(container, chapter.keyframes.length, update);
  const camera = chapter.keyframes[0]!;
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
          snapshotMode={snapshotMode}
          onMapReady={handleMapReady}
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

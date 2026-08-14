import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Camera,
  PublicationAsset,
  PublicationChapter,
} from "@earth-stories/story-schema";
import { MapChapter } from "./MapChapter.js";
import { flyoverTrackHeight, interpolateFlyover } from "./flyover.js";
import { useFlyoverScroll } from "./useFlyoverScroll.js";
import type { PublicationRuntimePolicy } from "./publicationRuntime.js";

interface Props {
  chapter: Extract<PublicationChapter, { type: "flyover" }>;
  asset: PublicationAsset | null;
  overlayAssets: PublicationAsset[];
  basemapStyle: string;
  runtimePolicy?: PublicationRuntimePolicy;
  snapshotMode?: boolean;
  interactive?: boolean;
  cameraOverride?: Camera | null;
  onCameraChange?: (camera: Camera) => void;
}

export { flyoverTrackHeight } from "./flyover.js";

export function FlyoverChapter({
  chapter,
  asset,
  overlayAssets,
  basemapStyle,
  runtimePolicy,
  snapshotMode = false,
  interactive = false,
  cameraOverride,
  onCameraChange,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    setProgress(0);
  }, [chapter.id]);
  const activeCamera: Camera =
    cameraOverride ??
    interpolateFlyover(chapter.keyframes, Math.min(1, progress)) ??
    chapter.keyframes[0]!;
  const update = useCallback((nextProgress: number) => {
    setProgress((current) => {
      const quantized = Math.round(nextProgress * 1_000) / 1_000;
      return current === quantized ? current : quantized;
    });
  }, []);
  useFlyoverScroll(container, chapter.keyframes.length, update);
  const activeIndex = Math.min(
    chapter.keyframes.length - 1,
    Math.floor(progress * (chapter.keyframes.length - 1)),
  );
  const caption = chapter.keyframes[activeIndex]?.caption?.trim();
  const mapChapter = {
    ...chapter,
    type: "map" as const,
    camera: activeCamera,
    assetId: chapter.assetId ?? "",
    transition: "instant" as const,
  };
  return (
    <div
      ref={container}
      className="story-flyover"
      style={{
        height: flyoverTrackHeight({
          scrollLength: chapter.scrollLength,
          keyframeCount: chapter.keyframes.length,
        }),
      }}
    >
      <div className="story-flyover__sticky">
        <MapChapter
          chapter={mapChapter}
          asset={asset}
          overlayAssets={overlayAssets}
          basemapStyle={basemapStyle}
          runtimePolicy={runtimePolicy}
          interactive={interactive}
          followCamera
          snapshotMode={snapshotMode}
          onCameraChange={onCameraChange}
        />
        {caption ? (
          <div className="story-flyover__caption" aria-live="polite">
            {caption}
          </div>
        ) : null}
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

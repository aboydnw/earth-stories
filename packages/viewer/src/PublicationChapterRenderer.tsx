import { lazy, Suspense, useState } from "react";
import ReactMarkdown from "react-markdown";
import type {
  Camera,
  PublicationAsset,
  PublicationChapter,
} from "@earth-stories/story-schema";
import { LEGACY_DEFAULT_CAMERA } from "@earth-stories/story-schema";
import { StoryMapHydrationBoundary } from "./StoryMapHydrationBoundary.js";
import { VisualizationProvenance } from "./VisualizationProvenance.js";
import { flyoverTrackHeight } from "./flyover.js";
import type { PublicationRuntimePolicy } from "./publicationRuntime.js";

const MapChapter = lazy(async () => ({
  default: (await import("./MapChapter.js")).MapChapter,
}));
const ChartChapter = lazy(async () => ({
  default: (await import("./ChartChapter.js")).ChartChapter,
}));
const FlyoverChapter = lazy(async () => ({
  default: (await import("./FlyoverChapter.js")).FlyoverChapter,
}));
const ImageLightbox = lazy(async () => ({
  default: (await import("./ImageLightbox.js")).ImageLightbox,
}));

function ImageFigure({
  src,
  alt,
  caption,
  enlargeable,
}: {
  src: string;
  alt: string;
  caption: string;
  enlargeable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const image = <img src={src} alt={alt} />;
  return (
    <figure className="story-image">
      {enlargeable ? (
        <button
          type="button"
          className="story-image__open"
          onClick={() => setOpen(true)}
          aria-label={`Open ${alt || caption || "image"} full size`}
        >
          {image}
        </button>
      ) : (
        image
      )}
      <figcaption>{caption}</figcaption>
      {open ? (
        <Suspense fallback={null}>
          <ImageLightbox
            src={src}
            alt={alt}
            caption={caption}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      ) : null}
    </figure>
  );
}

export type ChapterComposition =
  "full-story" | "focused-preview" | "authoring-map";

export function usesLegacyAutomaticFit(camera: Camera) {
  return (
    camera.center[0] === LEGACY_DEFAULT_CAMERA.center[0] &&
    camera.center[1] === LEGACY_DEFAULT_CAMERA.center[1] &&
    camera.zoom === LEGACY_DEFAULT_CAMERA.zoom &&
    camera.bearing === LEGACY_DEFAULT_CAMERA.bearing &&
    camera.pitch === LEGACY_DEFAULT_CAMERA.pitch
  );
}

export function PublicationChapterRenderer({
  chapter,
  index = 0,
  assets,
  basemapStyle,
  runtimePolicy,
  snapshotMode = false,
  composition = "full-story",
  interactiveMap = false,
  fitRequestToken,
  commitAutoFit = false,
  onCameraChange,
  onFitAvailabilityChange,
  onFitCameraChange,
  cameraOverride,
}: {
  chapter: PublicationChapter;
  index?: number;
  assets: Map<string, PublicationAsset>;
  basemapStyle: string;
  runtimePolicy: PublicationRuntimePolicy;
  snapshotMode?: boolean;
  composition?: ChapterComposition;
  interactiveMap?: boolean;
  fitRequestToken?: string | number;
  commitAutoFit?: boolean;
  onCameraChange?: (camera: Camera) => void;
  onFitAvailabilityChange?: (available: boolean) => void;
  onFitCameraChange?: (camera: Camera) => void;
  cameraOverride?: Camera | null;
}) {
  const asset =
    "assetId" in chapter && chapter.assetId
      ? (assets.get(chapter.assetId) ?? null)
      : null;
  const overlayAssets =
    "overlayAssetIds" in chapter
      ? chapter.overlayAssetIds.flatMap((id) => {
          const overlay = assets.get(id);
          return overlay ? [overlay] : [];
        })
      : [];
  const visualizationAssets = [...(asset ? [asset] : []), ...overlayAssets];
  const focused = composition !== "full-story";
  const mapChapter = chapter.type === "map" || chapter.type === "scrolly";

  return (
    <section
      className={`story-chapter story-chapter--${chapter.type}${focused ? " story-chapter--focused" : ""}`}
      id={chapter.id}
      data-chapter-id={chapter.id}
    >
      {!focused ? (
        <p className="story-folio">{String(index + 1).padStart(2, "0")}</p>
      ) : null}
      <div className="story-copy">
        <h2>{chapter.title}</h2>
        <ReactMarkdown>{chapter.narrative}</ReactMarkdown>
      </div>
      {mapChapter && asset ? (
        <StoryMapHydrationBoundary
          eager={snapshotMode || composition === "authoring-map"}
          fallback={
            <div className="story-map story-map--loading">Preparing map…</div>
          }
        >
          <Suspense
            fallback={
              <div className="story-map story-map--loading">Preparing map…</div>
            }
          >
            <MapChapter
              chapter={chapter}
              asset={asset}
              overlayAssets={overlayAssets}
              basemapStyle={basemapStyle}
              runtimePolicy={runtimePolicy}
              interactive={focused ? interactiveMap : true}
              followCamera={focused}
              autoFit={commitAutoFit || usesLegacyAutomaticFit(chapter.camera)}
              commitAutoFit={commitAutoFit}
              fitRequestToken={fitRequestToken}
              snapshotMode={snapshotMode}
              onCameraChange={onCameraChange}
              onFitAvailabilityChange={onFitAvailabilityChange}
              onFitCameraChange={onFitCameraChange}
            />
          </Suspense>
        </StoryMapHydrationBoundary>
      ) : null}
      {chapter.type === "video" && runtimePolicy.offline ? (
        <div className="story-video story-video--offline" role="status">
          Video is unavailable offline.
        </div>
      ) : null}
      {chapter.type === "video" && !runtimePolicy.offline ? (
        <figure className="story-video">
          <iframe
            src={
              chapter.provider === "youtube"
                ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(chapter.videoId)}`
                : `https://player.vimeo.com/video/${encodeURIComponent(chapter.videoId)}`
            }
            title={chapter.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
          <figcaption>
            <a href={chapter.originalUrl}>Open original video</a>
          </figcaption>
        </figure>
      ) : null}
      {chapter.type === "flyover" ? (
        <StoryMapHydrationBoundary
          eager={snapshotMode || composition === "authoring-map"}
          fallback={
            <div
              className="story-map story-map--loading story-map--flyover-placeholder"
              style={{
                minHeight: flyoverTrackHeight({
                  scrollLength: chapter.scrollLength,
                  keyframeCount: chapter.keyframes.length,
                }),
              }}
            >
              Preparing flyover…
            </div>
          }
        >
          <Suspense
            fallback={
              <div
                className="story-map story-map--loading story-map--flyover-placeholder"
                style={{
                  minHeight: flyoverTrackHeight({
                    scrollLength: chapter.scrollLength,
                    keyframeCount: chapter.keyframes.length,
                  }),
                }}
              >
                Preparing flyover…
              </div>
            }
          >
            <FlyoverChapter
              chapter={chapter}
              asset={asset}
              overlayAssets={overlayAssets}
              basemapStyle={basemapStyle}
              runtimePolicy={runtimePolicy}
              snapshotMode={snapshotMode}
              interactive={composition === "authoring-map" && interactiveMap}
              cameraOverride={cameraOverride}
              onCameraChange={onCameraChange}
            />
          </Suspense>
        </StoryMapHydrationBoundary>
      ) : null}
      {chapter.type === "image" && asset ? (
        <ImageFigure
          src={asset.href}
          alt={chapter.alt}
          caption={chapter.caption || asset.label}
          enlargeable={!snapshotMode}
        />
      ) : null}
      {chapter.type === "chart" && asset ? (
        <Suspense
          fallback={
            <div className="story-chart story-map--loading">
              Preparing chart…
            </div>
          }
        >
          <ChartChapter chapter={chapter} asset={asset} />
        </Suspense>
      ) : null}
      {visualizationAssets.length ? (
        <VisualizationProvenance assets={visualizationAssets} />
      ) : null}
    </section>
  );
}

import { lazy, Suspense } from "react";
import ReactMarkdown from "react-markdown";
import type {
  Camera,
  PublicationAsset,
  PublicationChapter,
} from "@earth-stories/story-schema";
import { StoryMapHydrationBoundary } from "./StoryMapHydrationBoundary.js";
import { VisualizationProvenance } from "./VisualizationProvenance.js";

const MapChapter = lazy(async () => ({
  default: (await import("./MapChapter.js")).MapChapter,
}));
const ChartChapter = lazy(async () => ({
  default: (await import("./ChartChapter.js")).ChartChapter,
}));
const FlyoverChapter = lazy(async () => ({
  default: (await import("./FlyoverChapter.js")).FlyoverChapter,
}));

export type ChapterComposition =
  "full-story" | "focused-preview" | "authoring-map";

export function usesLegacyAutomaticFit(camera: Camera) {
  return (
    camera.center[0] === 0 &&
    camera.center[1] === 20 &&
    camera.zoom === 1.5 &&
    camera.bearing === 0 &&
    camera.pitch === 0
  );
}

export function PublicationChapterRenderer({
  chapter,
  index = 0,
  assets,
  basemapStyle,
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
      {chapter.type === "video" ? (
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
          eager={snapshotMode}
          fallback={
            <div className="story-map story-map--loading story-map--flyover-placeholder">
              Preparing flyover…
            </div>
          }
        >
          <Suspense
            fallback={
              <div className="story-map story-map--loading story-map--flyover-placeholder">
                Preparing flyover…
              </div>
            }
          >
            <FlyoverChapter
              chapter={chapter}
              asset={asset}
              overlayAssets={overlayAssets}
              basemapStyle={basemapStyle}
              snapshotMode={snapshotMode}
              interactive={composition === "authoring-map" && interactiveMap}
              cameraOverride={cameraOverride}
              onCameraChange={onCameraChange}
            />
          </Suspense>
        </StoryMapHydrationBoundary>
      ) : null}
      {chapter.type === "image" && asset ? (
        <figure className="story-image">
          <img src={asset.href} alt={chapter.alt} />
          <figcaption>{chapter.caption || asset.label}</figcaption>
        </figure>
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

import { Fragment, lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  publicationBasemapHref,
  type Camera,
  type PublicationManifest,
} from "@earth-stories/story-schema";
import { groupChaptersIntoBlocks } from "./chapterBlocks.js";
import { StoryMapHydrationBoundary } from "./StoryMapHydrationBoundary.js";
import { VisualizationProvenance } from "./VisualizationProvenance.js";
import { PublicationChapterRenderer } from "./PublicationChapterRenderer.js";
import { publicationRuntimePolicy } from "./publicationRuntime.js";
import "./viewer.css";

const ScrollytellingBlock = lazy(async () => ({
  default: (await import("./ScrollytellingBlock.js")).ScrollytellingBlock,
}));

export interface StoryViewerProps {
  manifest: PublicationManifest;
  embed?: boolean;
  theme?: "cng" | "editorial";
  snapshotMode?: boolean;
  onChapterCameraChange?: (chapterId: string, camera: Camera) => void;
}

export function StoryViewer({
  manifest,
  embed = false,
  theme,
  snapshotMode = false,
  onChapterCameraChange,
}: StoryViewerProps) {
  const [readingProgress, setReadingProgress] = useState(0);
  const assets = useMemo(
    () => new Map(manifest.assets.map((asset) => [asset.id, asset])),
    [manifest.assets],
  );
  const chapterBlocks = useMemo(
    () => groupChaptersIntoBlocks(manifest.chapters),
    [manifest.chapters],
  );
  const runtimePolicy = useMemo(
    () => publicationRuntimePolicy(manifest),
    [manifest],
  );
  useEffect(() => {
    if (embed) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const available =
        document.documentElement.scrollHeight - window.innerHeight;
      setReadingProgress(
        available > 0
          ? Math.min(1, Math.max(0, window.scrollY / available))
          : 0,
      );
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [embed]);

  return (
    <main
      className={`story-publication story-publication--${theme ?? manifest.publication.theme}${embed ? " story-publication--embed" : ""}`}
    >
      {!embed ? (
        <div className="story-reading-progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${readingProgress})` }} />
        </div>
      ) : null}
      {!embed ? (
        <header className="story-masthead">
          <p className="story-kicker">A geospatial field story</p>
          <h1>{manifest.metadata.title}</h1>
          <p className="story-deck">{manifest.metadata.description}</p>
          <div className="story-rule" aria-hidden="true" />
          <p className="story-byline">
            {manifest.metadata.author ?? "Independent publication"}
          </p>
        </header>
      ) : null}

      <article className="story-chapters">
        {chapterBlocks.map((block) => {
          if (block.type === "scrolly") {
            const blockAssets = block.chapters.flatMap((chapter) => [
              ...(assets.get(chapter.assetId)
                ? [assets.get(chapter.assetId)!]
                : []),
              ...chapter.overlayAssetIds.flatMap((id) =>
                assets.get(id) ? [assets.get(id)!] : [],
              ),
            ]);
            return (
              <Fragment key={`scrolly-${block.startIndex}`}>
                <StoryMapHydrationBoundary
                  eager={snapshotMode}
                  fallback={
                    <div
                      className="story-map story-map--loading story-map--scrolly-placeholder"
                      style={{ minHeight: `${block.chapters.length * 92}dvh` }}
                    >
                      Preparing guided map…
                    </div>
                  }
                >
                  <Suspense
                    fallback={
                      <div
                        className="story-map story-map--loading story-map--scrolly-placeholder"
                        style={{
                          minHeight: `${block.chapters.length * 92}dvh`,
                        }}
                      >
                        Preparing guided map…
                      </div>
                    }
                  >
                    <ScrollytellingBlock
                      chapters={block.chapters}
                      startIndex={block.startIndex}
                      assets={assets}
                      basemapStyle={publicationBasemapHref(manifest.basemap)}
                      runtimePolicy={runtimePolicy}
                      snapshotMode={snapshotMode}
                    />
                  </Suspense>
                </StoryMapHydrationBoundary>
                <VisualizationProvenance assets={blockAssets} />
              </Fragment>
            );
          }
          const { chapter, index } = block;
          return (
            <PublicationChapterRenderer
              key={chapter.id}
              chapter={chapter}
              index={index}
              assets={assets}
              basemapStyle={publicationBasemapHref(manifest.basemap)}
              runtimePolicy={runtimePolicy}
              snapshotMode={snapshotMode}
              onCameraChange={(camera) =>
                onChapterCameraChange?.(chapter.id, camera)
              }
            />
          );
        })}
      </article>

      {!embed ? (
        <footer className="story-footer">
          <span>Built with Earth Stories</span>
          <span>Build {manifest.build.id}</span>
        </footer>
      ) : null}
    </main>
  );
}

import { lazy, Suspense, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { PublicationManifest } from "@earth-stories/story-schema";
import { groupChaptersIntoBlocks } from "./chapterBlocks.js";
import "./viewer.css";

const MapChapter = lazy(async () => {
  const module = await import("./MapChapter.js");
  return { default: module.MapChapter };
});
const ChartChapter = lazy(async () => ({
  default: (await import("./ChartChapter.js")).ChartChapter,
}));
const FlyoverChapter = lazy(async () => ({
  default: (await import("./FlyoverChapter.js")).FlyoverChapter,
}));
const ScrollytellingBlock = lazy(async () => ({
  default: (await import("./ScrollytellingBlock.js")).ScrollytellingBlock,
}));

export interface StoryViewerProps {
  manifest: PublicationManifest;
  embed?: boolean;
  theme?: "cng" | "editorial";
}

export function StoryViewer({
  manifest,
  embed = false,
  theme,
}: StoryViewerProps) {
  const [readingProgress, setReadingProgress] = useState(0);
  const assets = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const chapterBlocks = groupChaptersIntoBlocks(manifest.chapters);
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
            return (
              <Suspense
                key={`scrolly-${block.startIndex}`}
                fallback={
                  <div className="story-map story-map--loading">
                    Preparing guided map…
                  </div>
                }
              >
                <ScrollytellingBlock
                  chapters={block.chapters}
                  startIndex={block.startIndex}
                  assets={assets}
                  basemapStyle={manifest.basemap.styleUrl}
                />
              </Suspense>
            );
          }
          const { chapter, index } = block;
          const asset =
            "assetId" in chapter && chapter.assetId
              ? assets.get(chapter.assetId)
              : null;
          const overlayAssets =
            "overlayAssetIds" in chapter
              ? chapter.overlayAssetIds.flatMap((id) => {
                  const overlay = assets.get(id);
                  return overlay ? [overlay] : [];
                })
              : [];
          return (
            <section
              className={`story-chapter story-chapter--${chapter.type}`}
              key={chapter.id}
              id={chapter.id}
              data-chapter-id={chapter.id}
            >
              <p className="story-folio">
                {String(index + 1).padStart(2, "0")}
              </p>
              <div className="story-copy">
                <h2>{chapter.title}</h2>
                <ReactMarkdown>{chapter.narrative}</ReactMarkdown>
              </div>
              {chapter.type === "map" && asset ? (
                <Suspense
                  fallback={
                    <div className="story-map story-map--loading">
                      Preparing map…
                    </div>
                  }
                >
                  <MapChapter
                    chapter={chapter}
                    asset={asset}
                    overlayAssets={overlayAssets}
                    basemapStyle={manifest.basemap.styleUrl}
                    autoFit
                  />
                </Suspense>
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
                <Suspense
                  fallback={
                    <div className="story-map story-map--loading">
                      Preparing flyover…
                    </div>
                  }
                >
                  <FlyoverChapter
                    chapter={chapter}
                    asset={asset ?? null}
                    overlayAssets={overlayAssets}
                    basemapStyle={manifest.basemap.styleUrl}
                  />
                </Suspense>
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
            </section>
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

import { lazy, Suspense } from "react";
import ReactMarkdown from "react-markdown";
import type { PublicationManifest } from "@earth-stories/story-schema";
import "./viewer.css";

const MapChapter = lazy(async () => {
  const module = await import("./MapChapter.js");
  return { default: module.MapChapter };
});
const ChartChapter = lazy(async () => ({
  default: (await import("./ChartChapter.js")).ChartChapter,
}));

export interface StoryViewerProps {
  manifest: PublicationManifest;
  embed?: boolean;
  theme?: "cng" | "editorial";
}

export function StoryViewer({
  manifest,
  embed = false,
  theme = "cng",
}: StoryViewerProps) {
  const assets = new Map(manifest.assets.map((asset) => [asset.id, asset]));

  return (
    <main
      className={`story-publication story-publication--${theme}${embed ? " story-publication--embed" : ""}`}
    >
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
        {manifest.chapters.map((chapter, index) => {
          const asset =
            chapter.type === "prose" ? null : assets.get(chapter.assetId);
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
              {(chapter.type === "map" || chapter.type === "scrolly") &&
              asset ? (
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

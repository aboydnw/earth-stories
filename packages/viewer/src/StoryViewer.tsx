import { lazy, Suspense } from "react";
import ReactMarkdown from "react-markdown";
import type { PublicationManifest } from "@earth-stories/story-schema";
import "./viewer.css";

const MapChapter = lazy(async () => {
  const module = await import("./MapChapter.js");
  return { default: module.MapChapter };
});

export interface StoryViewerProps {
  manifest: PublicationManifest;
}

export function StoryViewer({ manifest }: StoryViewerProps) {
  const assets = new Map(manifest.assets.map((asset) => [asset.id, asset]));

  return (
    <main className="story-publication">
      <header className="story-masthead">
        <p className="story-kicker">A geospatial field story</p>
        <h1>{manifest.metadata.title}</h1>
        <p className="story-deck">{manifest.metadata.description}</p>
        <div className="story-rule" aria-hidden="true" />
        <p className="story-byline">
          {manifest.metadata.author ?? "Independent publication"}
        </p>
      </header>

      <article className="story-chapters">
        {manifest.chapters.map((chapter, index) => {
          const asset =
            chapter.type === "map" ? assets.get(chapter.assetId) : null;
          return (
            <section className="story-chapter" key={chapter.id} id={chapter.id}>
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
                    basemapStyle={manifest.basemap.styleUrl}
                  />
                </Suspense>
              ) : null}
            </section>
          );
        })}
      </article>

      <footer className="story-footer">
        <span>Built with Earth Stories</span>
        <span>Build {manifest.build.id}</span>
      </footer>
    </main>
  );
}

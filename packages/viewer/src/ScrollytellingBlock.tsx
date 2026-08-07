import { Suspense, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type {
  PublicationAsset,
  PublicationChapter,
} from "@earth-stories/story-schema";
import { MapChapter } from "./MapChapter.js";

type ScrollyChapter = Extract<PublicationChapter, { type: "scrolly" }>;

export function ScrollytellingBlock({
  chapters,
  startIndex,
  assets,
  basemapStyle,
}: {
  chapters: ScrollyChapter[];
  startIndex: number;
  assets: Map<string, PublicationAsset>;
  basemapStyle: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const stepsRef = useRef<HTMLDivElement>(null);
  const activeChapter = chapters[activeIndex] ?? chapters[0];
  const asset = assets.get(activeChapter.assetId) ?? null;
  const overlayAssets = activeChapter.overlayAssetIds.flatMap((id) => {
    const overlay = assets.get(id);
    return overlay ? [overlay] : [];
  });

  useEffect(() => {
    const steps = stepsRef.current?.querySelectorAll<HTMLElement>(
      "[data-scrolly-step]",
    );
    if (!steps?.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        setActiveIndex(
          Number((visible.target as HTMLElement).dataset.scrollyStep),
        );
      },
      { rootMargin: "-18% 0px -55%", threshold: [0.15, 0.35, 0.6] },
    );
    steps.forEach((step) => observer.observe(step));
    return () => observer.disconnect();
  }, [chapters]);

  return (
    <section className="story-scrolly" aria-label="Guided map story">
      <div className="story-scrolly__map">
        <Suspense
          fallback={
            <div className="story-map story-map--loading">Preparing map…</div>
          }
        >
          <MapChapter
            chapter={activeChapter}
            asset={asset}
            overlayAssets={overlayAssets}
            basemapStyle={basemapStyle}
            controlled
          />
        </Suspense>
      </div>
      <div className="story-scrolly__steps" ref={stepsRef}>
        {chapters.map((chapter, index) => (
          <section
            className={`story-scrolly__step story-scrolly__step--${chapter.overlayPosition ?? "left"}${activeIndex === index ? " is-active" : ""}`}
            id={chapter.id}
            data-chapter-id={chapter.id}
            data-scrolly-step={index}
            key={chapter.id}
          >
            <div className="story-scrolly__card">
              <p className="story-folio">
                {String(startIndex + index + 1).padStart(2, "0")}
              </p>
              <div className="story-copy">
                <h2>{chapter.title}</h2>
                <ReactMarkdown>{chapter.narrative}</ReactMarkdown>
              </div>
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

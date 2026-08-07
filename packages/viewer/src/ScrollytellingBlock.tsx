import { Suspense, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type {
  PublicationAsset,
  PublicationChapter,
} from "@earth-stories/story-schema";
import { MapChapter } from "./MapChapter.js";

type ScrollyChapter = Extract<PublicationChapter, { type: "scrolly" }>;

const sceneKey = (chapter: ScrollyChapter) =>
  [chapter.assetId, ...chapter.overlayAssetIds].join("|");

export function ScrollytellingBlock({
  chapters,
  startIndex,
  assets,
  basemapStyle,
  snapshotMode = false,
}: {
  chapters: ScrollyChapter[];
  startIndex: number;
  assets: Map<string, PublicationAsset>;
  basemapStyle: string;
  snapshotMode?: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [committedIndex, setCommittedIndex] = useState(0);
  const requestedIndex = useRef(0);
  const stepsRef = useRef<HTMLDivElement>(null);
  const activeChapter = chapters[activeIndex] ?? chapters[0];
  const committedChapter = chapters[committedIndex] ?? chapters[0];
  const sameScene = sceneKey(committedChapter) === sceneKey(activeChapter);
  const visibleAsset = assets.get(committedChapter.assetId) ?? null;
  const visibleOverlayAssets = committedChapter.overlayAssetIds.flatMap(
    (id) => {
      const overlay = assets.get(id);
      return overlay ? [overlay] : [];
    },
  );
  const pendingAsset = sameScene
    ? null
    : (assets.get(activeChapter.assetId) ?? null);
  const pendingOverlayAssets = activeChapter.overlayAssetIds.flatMap((id) => {
    const overlay = assets.get(id);
    return overlay ? [overlay] : [];
  });
  requestedIndex.current = activeIndex;

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
          <div className="story-map-scenes">
            {[
              {
                key: sceneKey(committedChapter),
                pending: false,
                chapter: sameScene
                  ? activeChapter
                  : {
                      ...committedChapter,
                      camera: activeChapter.camera,
                      transition: activeChapter.transition,
                    },
                asset: visibleAsset,
                overlays: visibleOverlayAssets,
              },
              ...(!sameScene && pendingAsset
                ? [
                    {
                      key: sceneKey(activeChapter),
                      pending: true,
                      chapter: activeChapter,
                      asset: pendingAsset,
                      overlays: pendingOverlayAssets,
                    },
                  ]
                : []),
            ].map((scene) => (
              <div
                className={`story-map-scene ${scene.pending ? "is-pending" : "is-committed"}`}
                aria-hidden={scene.pending || undefined}
                key={scene.key}
              >
                <MapChapter
                  chapter={scene.chapter}
                  asset={scene.asset}
                  overlayAssets={scene.overlays}
                  basemapStyle={basemapStyle}
                  controlled
                  snapshotMode={snapshotMode}
                  onReady={
                    scene.pending
                      ? () => {
                          if (requestedIndex.current === activeIndex)
                            setCommittedIndex(activeIndex);
                        }
                      : undefined
                  }
                />
              </div>
            ))}
            {!sameScene ? (
              <div className="story-map__preparing" role="status">
                Preparing next chapter
              </div>
            ) : null}
          </div>
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

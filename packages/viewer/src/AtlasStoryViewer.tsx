import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  publicationBasemapHref,
  type Camera,
  type PublicationManifest,
} from "@earth-stories/story-schema";
import { PublicationChapterRenderer } from "./PublicationChapterRenderer.js";
import { publicationRuntimePolicy } from "./publicationRuntime.js";
import { StoryContinuations } from "./StoryContinuations.js";
import "./atlas.css";

function CompassRose() {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      aria-hidden="true"
      className="atlas-compass"
    >
      <circle cx="40" cy="40" r="27" />
      <circle cx="40" cy="40" r="23" strokeDasharray="1 4" />
      <path d="M40 3 47 33 77 40 47 47 40 77 33 47 3 40 33 33Z" />
      <path
        d="m40 3 7 30-7 7Zm37 37-30 7-7-7ZM40 77l-7-30 7-7ZM3 40l30-7 7 7Z"
        fill="currentColor"
      />
      <circle cx="40" cy="40" r="3" fill="var(--story-paper)" />
    </svg>
  );
}

/** A reader-directed atlas: real links, no scroll interception or autoplay. */
export function AtlasStoryViewer({
  manifest,
  embed = false,
  snapshotMode = false,
  onChapterCameraChange,
}: {
  manifest: PublicationManifest;
  embed?: boolean;
  snapshotMode?: boolean;
  onChapterCameraChange?: (chapterId: string, camera: Camera) => void;
}) {
  const chapters = manifest.chapters;
  const chapterFromHash = () => {
    try {
      const id = decodeURIComponent(window.location.hash.slice(1));
      return chapters.findIndex((chapter) => chapter.id === id);
    } catch {
      return -1;
    }
  };
  const [selected, setSelected] = useState(() =>
    Math.max(0, chapterFromHash()),
  );
  const [readAll, setReadAll] = useState(snapshotMode);
  const [resetKey, setResetKey] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const focusNext = useRef(false);
  const assets = useMemo(
    () => new Map(manifest.assets.map((asset) => [asset.id, asset])),
    [manifest.assets],
  );
  const runtimePolicy = useMemo(
    () => publicationRuntimePolicy(manifest),
    [manifest],
  );
  const activeIndex = Math.min(selected, Math.max(0, chapters.length - 1));
  const chapter = chapters[activeIndex];
  const allVisible = readAll || snapshotMode;

  useEffect(() => {
    const followLocation = () => {
      const index = chapterFromHash();
      setSelected(Math.max(0, index));
    };
    followLocation();
    window.addEventListener("hashchange", followLocation);
    window.addEventListener("popstate", followLocation);
    return () => {
      window.removeEventListener("hashchange", followLocation);
      window.removeEventListener("popstate", followLocation);
    };
  }, [chapters]);

  useEffect(() => {
    if (!focusNext.current || !chapter) return;
    focusNext.current = false;
    const section = Array.from(
      stage.current?.querySelectorAll<HTMLElement>("[data-chapter-id]") ?? [],
    ).find((element) => element.dataset.chapterId === chapter.id);
    section?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    const bounds = section?.querySelector("h2")?.getBoundingClientRect();
    if (
      allVisible ||
      (bounds && (bounds.top < 0 || bounds.bottom > window.innerHeight))
    )
      section?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [activeIndex, chapter, allVisible]);

  useEffect(() => {
    const list = navigation.current?.querySelector("ol");
    const link = navigation.current?.querySelector('[aria-current="step"]');
    if (!list || !link) return;
    const bounds = link.getBoundingClientRect();
    const viewport = list.getBoundingClientRect();
    list.scrollLeft +=
      Math.max(0, bounds.right - viewport.right) +
      Math.min(0, bounds.left - viewport.left);
  }, [activeIndex]);

  const navigate = (event: MouseEvent<HTMLAnchorElement>, index: number) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    const target = chapters[index];
    if (!target) return;
    const hash = `#${encodeURIComponent(target.id)}`;
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    focusNext.current = true;
    setSelected(index);
    // Selecting the current chapter is still a useful way back after exploration.
    if (index === activeIndex) {
      focusNext.current = false;
      const section = Array.from(
        stage.current?.querySelectorAll<HTMLElement>("[data-chapter-id]") ?? [],
      ).find((element) => element.dataset.chapterId === target.id);
      section?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
      const bounds = section?.querySelector("h2")?.getBoundingClientRect();
      if (
        allVisible ||
        (bounds && (bounds.top < 0 || bounds.bottom > window.innerHeight))
      )
        section?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  };

  return (
    <main
      className={`story-publication story-publication--atlas${embed ? " story-publication--embed" : ""}${allVisible ? " atlas--read-all" : ""}`}
    >
      <header className="atlas-masthead">
        <div className="atlas-imprint">
          <CompassRose />
          <span>
            Earth Stories
            <br />
            <strong>Field atlas</strong>
          </span>
        </div>
        <div className="atlas-title">
          <h1>{manifest.metadata.title}</h1>
          <p>{manifest.metadata.description}</p>
        </div>
        {!snapshotMode && (
          <button
            type="button"
            className="atlas-view-toggle"
            aria-pressed={readAll}
            onClick={() => {
              focusNext.current = true;
              setReadAll((value) => !value);
            }}
          >
            {readAll ? "Chapter view" : "Read all chapters"}
          </button>
        )}
      </header>

      {!snapshotMode && (
        <nav
          ref={navigation}
          className="atlas-navigation"
          aria-label="Story chapters"
        >
          <ol>
            {chapters.map((item, index) => (
              <li key={item.id}>
                <a
                  href={`#${encodeURIComponent(item.id)}`}
                  aria-label={`Chapter ${index + 1}: ${item.title}`}
                  aria-current={index === activeIndex ? "step" : undefined}
                  onClick={(event) => navigate(event, index)}
                >
                  <span className="atlas-navigation__number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{item.title}</span>
                  <i aria-hidden="true" />
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="atlas-stage" ref={stage}>
        {chapter ? (
          (allVisible ? chapters : [chapter]).map((item) => (
            <PublicationChapterRenderer
              // Preserve the map between chapter changes so camera and time can animate.
              key={allVisible ? item.id : `atlas-stage-${resetKey}`}
              chapter={item}
              index={chapters.indexOf(item)}
              assets={assets}
              basemapStyle={publicationBasemapHref(manifest.basemap)}
              runtimePolicy={runtimePolicy}
              snapshotMode={snapshotMode}
              composition="atlas"
              onCameraChange={(camera) =>
                onChapterCameraChange?.(item.id, camera)
              }
            />
          ))
        ) : (
          <p role="status">This atlas has no chapters yet.</p>
        )}
      </div>

      {!snapshotMode && chapter && (
        <div className="atlas-reader-tools">
          <p>
            {chapter.type === "map" || chapter.type === "scrolly"
              ? "Pan, zoom, or scrub time. The next chapter brings you back to the story."
              : "Follow the chapters, or choose your own place in the story."}
          </p>
          {!allVisible &&
            (chapter.type === "map" || chapter.type === "scrolly") && (
              <button
                type="button"
                onClick={() => setResetKey((value) => value + 1)}
              >
                Return to chapter view
              </button>
            )}
          <span
            className="atlas-page-count"
            aria-live="polite"
            aria-atomic="true"
          >
            Chapter {activeIndex + 1} of {chapters.length}
          </span>
          <div className="atlas-page-turns">
            {activeIndex > 0 ? (
              <a
                href={`#${encodeURIComponent(chapters[activeIndex - 1]!.id)}`}
                onClick={(event) => navigate(event, activeIndex - 1)}
                aria-label={`Previous chapter: ${chapters[activeIndex - 1]!.title}`}
              >
                <span aria-hidden="true">←</span> Previous
              </a>
            ) : (
              <span />
            )}
            {activeIndex < chapters.length - 1 ? (
              <a
                href={`#${encodeURIComponent(chapters[activeIndex + 1]!.id)}`}
                onClick={(event) => navigate(event, activeIndex + 1)}
                aria-label={`Next chapter: ${chapters[activeIndex + 1]!.title}`}
              >
                Next chapter <span aria-hidden="true">→</span>
              </a>
            ) : (
              <a
                href={`#${encodeURIComponent(chapters[0]!.id)}`}
                onClick={(event) => navigate(event, 0)}
              >
                Back to the beginning <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        </div>
      )}
      {!embed && <StoryContinuations continuations={manifest.continuations} />}
      {!embed && (
        <footer className="atlas-footer">
          <span>{manifest.metadata.author ?? "Independent publication"}</span>
          <span>Built with Earth Stories</span>
        </footer>
      )}
    </main>
  );
}

import { useEffect, useState, type ReactNode } from "react";
import { EditorViewTabs, type EditorRegion } from "./EditorViewTabs";

const compactEditorQuery = "(max-width: 960px)";
const labels: Record<EditorRegion, string> = {
  chapters: "Chapters",
  canvas: "Canvas",
  edit: "Edit",
};

function useCompactEditor() {
  const [compact, setCompact] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(compactEditorQuery).matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(compactEditorQuery);
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    update();
    return () => query.removeEventListener("change", update);
  }, []);

  return compact;
}

export function EditorShell({
  region,
  onRegionChange,
  chapters,
  canvas,
  inspector,
  guidance,
  error,
}: {
  region: EditorRegion;
  onRegionChange: (region: EditorRegion) => void;
  chapters: ReactNode;
  canvas: ReactNode;
  inspector: ReactNode;
  guidance?: ReactNode;
  error?: ReactNode;
}) {
  const compact = useCompactEditor();
  const content: Record<EditorRegion, ReactNode> = {
    chapters,
    canvas,
    edit: inspector,
  };

  return (
    <div
      className="chapter-editor-shell"
      data-layout={compact ? "tabs" : "grid"}
    >
      {guidance ? (
        <div className="chapter-editor-shell__guidance">{guidance}</div>
      ) : null}
      {error ? (
        <div className="chapter-editor-shell__error">{error}</div>
      ) : null}
      {compact ? (
        <>
          <EditorViewTabs active={region} onChange={onRegionChange} />
          <section
            className={`chapter-editor-shell__panel chapter-editor-shell__panel--${region}`}
            id={`editor-region-${region}`}
            role="tabpanel"
            tabIndex={0}
            aria-labelledby={`editor-tab-${region}`}
          >
            {content[region]}
          </section>
        </>
      ) : (
        (Object.keys(content) as EditorRegion[]).map((panel) => (
          <section
            key={panel}
            className={`chapter-editor-shell__panel chapter-editor-shell__panel--${panel}`}
            id={`editor-region-${panel}`}
            aria-label={labels[panel]}
          >
            {content[panel]}
          </section>
        ))
      )}
    </div>
  );
}

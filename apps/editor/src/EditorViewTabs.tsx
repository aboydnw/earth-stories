import { useRef, type KeyboardEvent } from "react";

export type EditorRegion = "chapters" | "canvas" | "edit";

const regions: ReadonlyArray<{ id: EditorRegion; label: string }> = [
  { id: "chapters", label: "Chapters" },
  { id: "canvas", label: "Canvas" },
  { id: "edit", label: "Edit" },
];

export function EditorViewTabs({
  active,
  onChange,
}: {
  active: EditorRegion;
  onChange: (region: EditorRegion) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function select(index: number) {
    const region = regions[index];
    if (!region) return;
    refs.current[index]?.focus();
    onChange(region.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const current = regions.findIndex(
      (region) => region.id === event.currentTarget.dataset.region,
    );
    if (current < 0) return;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (current + 1) % regions.length;
    if (event.key === "ArrowLeft")
      next = (current - 1 + regions.length) % regions.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = regions.length - 1;
    if (next === null) return;
    event.preventDefault();
    select(next);
  }

  return (
    <div className="editor-view-tabs" role="tablist" aria-label="Editor view">
      {regions.map((region, index) => (
        <button
          key={region.id}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="button"
          role="tab"
          id={`editor-tab-${region.id}`}
          data-region={region.id}
          aria-selected={active === region.id}
          aria-controls={`editor-region-${region.id}`}
          tabIndex={active === region.id ? 0 : -1}
          onClick={() => onChange(region.id)}
          onKeyDown={handleKeyDown}
        >
          {region.label}
        </button>
      ))}
    </div>
  );
}

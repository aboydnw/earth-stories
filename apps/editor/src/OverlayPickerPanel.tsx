import { useMemo, useState } from "react";
import type { ProjectSource } from "@earth-stories/story-schema";
import { PanelShell } from "@earth-stories/ui";

export function OverlayPickerPanel({
  open,
  sources,
  onOpenChange,
  onSelect,
  onAddData,
}: {
  open: boolean;
  sources: ProjectSource[];
  onOpenChange: (open: boolean) => void;
  onSelect: (sourceId: string) => void;
  onAddData: () => void;
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(
    () =>
      sources.filter((source) =>
        source.label.toLowerCase().includes(query.toLowerCase()),
      ),
    [query, sources],
  );
  return (
    <PanelShell
      open={open}
      title="Add overlay"
      eyebrow="Layers"
      onOpenChange={onOpenChange}
    >
      <div className="overlay-picker">
        {sources.length > 5 ? (
          <label>
            Search sources
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        ) : null}
        {visible.map((source) => (
          <button
            type="button"
            key={source.id}
            onClick={() => {
              onSelect(source.id);
              onOpenChange(false);
            }}
          >
            <strong>{source.label}</strong>
            <span>{source.kind}</span>
          </button>
        ))}
        {!visible.length ? <p>No matching overlays.</p> : null}
        <button type="button" onClick={onAddData}>
          Add data
        </button>
      </div>
    </PanelShell>
  );
}

import { useState } from "react";
import type { ProjectSource } from "@earth-stories/story-schema";
import { OverlayPickerPanel } from "./OverlayPickerPanel";

export function OverlayListEditor({
  primarySourceId,
  overlaySourceIds,
  sources,
  onChange,
  onEditSource,
  onAddData,
}: {
  primarySourceId: string | null;
  overlaySourceIds: string[];
  sources: ProjectSource[];
  onChange: (ids: string[]) => void;
  onEditSource: (id: string) => void;
  onAddData: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const candidates = sources.filter(
    ({ id }) => id !== primarySourceId && !overlaySourceIds.includes(id),
  );
  return (
    <div className="overlay-list-editor">
      {overlaySourceIds.map((id) => {
        const source = sources.find((candidate) => candidate.id === id);
        return (
          <div className="overlay-list-editor__row" key={id}>
            <div>
              <strong>{source?.label ?? "Missing source"}</strong>
              <small>{source?.kind ?? id}</small>
            </div>
            {source ? (
              <button type="button" onClick={() => onEditSource(id)}>
                Shared settings
              </button>
            ) : null}
            <button
              type="button"
              onClick={() =>
                onChange(overlaySourceIds.filter((sourceId) => sourceId !== id))
              }
            >
              Remove
            </button>
          </div>
        );
      })}
      {!overlaySourceIds.length ? (
        <p className="empty-copy">No overlays selected.</p>
      ) : null}
      <button type="button" onClick={() => setPickerOpen(true)}>
        Add overlay
      </button>
      <OverlayPickerPanel
        open={pickerOpen}
        sources={candidates}
        onOpenChange={setPickerOpen}
        onSelect={(id) => onChange([...overlaySourceIds, id])}
        onAddData={onAddData}
      />
    </div>
  );
}

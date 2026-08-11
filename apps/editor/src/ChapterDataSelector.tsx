import { useState } from "react";
import type { ProjectSource } from "@earth-stories/story-schema";
import { PanelShell, StatusBadge } from "@earth-stories/ui";

export function ChapterDataSelector({
  sourceId,
  sources,
  usageCount,
  onSelect,
  onEditSource,
  onAddData,
}: {
  sourceId: string | null;
  sources: ProjectSource[];
  usageCount: number;
  onSelect: (sourceId: string) => void;
  onEditSource: (sourceId: string) => void;
  onAddData: () => void;
}) {
  const [open, setOpen] = useState(false);
  const source = sources.find(({ id }) => id === sourceId);
  return (
    <div className="chapter-data-selector">
      {source ? (
        <div className="chapter-data-selector__summary">
          <div>
            <StatusBadge tone="neutral">{source.kind}</StatusBadge>
            <strong>{source.label}</strong>
            <small>
              {source.delivery} · used by {usageCount} chapter
              {usageCount === 1 ? "" : "s"}
            </small>
          </div>
          <div className="chapter-data-selector__actions">
            <button type="button" onClick={() => setOpen(true)}>
              Change
            </button>
            <button type="button" onClick={() => onEditSource(source.id)}>
              Edit shared source
            </button>
          </div>
        </div>
      ) : (
        <div className="chapter-data-selector__missing" role="status">
          <strong>Choose data</strong>
          <span>
            This chapter cannot render until it has a compatible source.
          </span>
          <button type="button" onClick={() => setOpen(true)}>
            Choose data
          </button>
        </div>
      )}
      <PanelShell
        open={open}
        title="Choose chapter data"
        eyebrow="Chapter data"
        onOpenChange={setOpen}
      >
        <div className="chapter-source-picker">
          {sources.map((candidate) => (
            <button
              type="button"
              key={candidate.id}
              aria-current={candidate.id === sourceId ? "true" : undefined}
              onClick={() => {
                onSelect(candidate.id);
                setOpen(false);
              }}
            >
              <strong>{candidate.label}</strong>
              <span>
                {candidate.kind} · {candidate.delivery}
              </span>
            </button>
          ))}
          {!sources.length ? (
            <p>No compatible sources are available yet.</p>
          ) : null}
          <button
            type="button"
            className="chapter-source-picker__add"
            onClick={() => {
              setOpen(false);
              onAddData();
            }}
          >
            Add data for this chapter
          </button>
        </div>
      </PanelShell>
    </div>
  );
}

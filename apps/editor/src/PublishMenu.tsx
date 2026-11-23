import { useEffect, useRef } from "react";
import { CaretDown, Export, Eye } from "@phosphor-icons/react";
import type { AuthoringReadiness } from "@earth-stories/publisher/readiness";
import { ActionButton } from "@earth-stories/ui";
import type { PublicationReadinessState } from "./usePublicationReadiness";

export function PublishMenu({
  open,
  onOpenChange,
  localReadiness,
  disabled = false,
  onLoadReadiness,
  onPreview,
  onPublish,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localReadiness: AuthoringReadiness;
  serverReadiness: PublicationReadinessState;
  chapterCount: number;
  sourceCount: number;
  previewReviewed: boolean;
  disabled?: boolean;
  unsaved?: boolean;
  onLoadReadiness: () => void;
  onPreview: () => void;
  onPublish: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    onLoadReadiness();
    const menu = rootRef.current?.querySelector<HTMLElement>('[role="menu"]');
    menu
      ?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')
      ?.focus();
    const dismiss = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") {
          event.preventDefault();
          onOpenChange(false);
          rootRef.current?.querySelector<HTMLElement>("button")?.focus();
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const items = [
            ...(menu?.querySelectorAll<HTMLElement>(
              '[role="menuitem"]:not([disabled])',
            ) ?? []),
          ];
          if (!items.length) return;
          event.preventDefault();
          const current = items.indexOf(document.activeElement as HTMLElement);
          const offset = event.key === "ArrowDown" ? 1 : -1;
          items[(current + offset + items.length) % items.length]?.focus();
        }
        return;
      }
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [onLoadReadiness, onOpenChange, open]);

  return (
    <div className="publish-menu" ref={rootRef}>
      <ActionButton
        className="button button--primary"
        disabled={disabled}
        aria-label="Publish"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <Export size={17} /> Publish
        <CaretDown size={14} />
      </ActionButton>
      {open ? (
        <div
          className="publish-menu__popover"
          role="menu"
          aria-label="Preview and publish"
        >
          <button
            type="button"
            role="menuitem"
            disabled={!localReadiness.manifest}
            onClick={() => {
              onOpenChange(false);
              onPreview();
            }}
          >
            <Eye size={18} />
            <span>
              <strong>Preview</strong>
              <small>Save and open the draft in a new tab</small>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onOpenChange(false);
              onPublish();
            }}
          >
            <Export size={18} />
            <span>
              <strong>Publish publicly</strong>
              <small>Choose a profile and build your publication</small>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

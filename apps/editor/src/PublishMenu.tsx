import { useEffect, useRef } from "react";
import { CaretDown, Export, Eye } from "@phosphor-icons/react";
import type { AuthoringReadiness } from "@earth-stories/publisher/readiness";
import { ActionButton, ReadinessSummary } from "@earth-stories/ui";
import type { PublicationReadinessState } from "./usePublicationReadiness";

export function PublishMenu({
  open,
  onOpenChange,
  localReadiness,
  serverReadiness,
  chapterCount,
  sourceCount,
  previewReviewed,
  disabled = false,
  unsaved = false,
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

  const useServer =
    !unsaved && serverReadiness.status === "ready" && serverReadiness.result;
  const findings = useServer
    ? serverReadiness.result!.issues
    : localReadiness.findings;
  const errors = findings.filter(({ severity }) => severity === "error").length;
  const warnings = findings.filter(
    ({ severity }) => severity === "warning",
  ).length;
  const stale =
    unsaved ||
    serverReadiness.status === "stale" ||
    (serverReadiness.status === "loading" && Boolean(serverReadiness.result));
  const status = useServer
    ? errors
      ? "blocked"
      : warnings
        ? "review"
        : "ready"
    : errors
      ? "blocked"
      : "review";

  return (
    <div className="publish-menu" ref={rootRef}>
      <ActionButton
        className="button button--primary"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <Export size={17} /> Publish <CaretDown size={14} />
      </ActionButton>
      {open ? (
        <div
          className="publish-menu__popover"
          role="menu"
          aria-label="Preview and publish"
        >
          <ReadinessSummary
            status={status}
            errors={errors}
            warnings={warnings}
            loading={
              serverReadiness.status === "loading" && !serverReadiness.result
            }
            stale={stale}
            metrics={`${chapterCount} chapter${chapterCount === 1 ? "" : "s"} · ${sourceCount} source${sourceCount === 1 ? "" : "s"} · ${previewReviewed ? "preview reviewed" : "preview needs review"}`}
          />
          {unsaved ||
          serverReadiness.status === "idle" ||
          serverReadiness.status === "stale" ? (
            <p className="publish-menu__checks">
              Run publication checks for filesystem and connected-source
              readiness.
            </p>
          ) : null}
          {serverReadiness.status === "error" ? (
            <p className="publish-menu__error" role="alert">
              {serverReadiness.error}
            </p>
          ) : null}
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
              <strong>See as a reader</strong>
              <small>Open the unpublished reader view</small>
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
              <small>Review checks, choose a profile, and build</small>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

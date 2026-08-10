import { useEffect, useRef, useState } from "react";
import { CaretDown, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import {
  GuidancePrompt,
  WorkflowGuide,
  type WorkflowStage,
} from "@earth-stories/ui";
import type { GuidanceAction, GuidanceDestination } from "./editorReadiness";

export function WorkflowStatusMenu({
  stages,
  guidance,
  errors,
  warnings,
  onStageSelect,
  onGuidance,
}: {
  stages: WorkflowStage[];
  guidance: GuidanceAction | null;
  errors: number;
  warnings: number;
  onStageSelect: (stageId: string) => void;
  onGuidance: (destination: GuidanceDestination) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [open]);

  const complete = stages.filter(
    ({ state }) => state === "complete" || state === "optional",
  ).length;
  const issueCount = errors + warnings;
  const label = errors
    ? `Blocked · ${issueCount}`
    : warnings
      ? `Needs review · ${warnings}`
      : `${complete}/${stages.length} steps`;
  const Icon = issueCount ? WarningCircle : CheckCircle;

  return (
    <div className="workflow-status-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="workflow-status-menu__trigger"
        data-status={errors ? "blocked" : warnings ? "review" : "ready"}
        aria-label={`Workflow status: ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon size={17} weight={issueCount ? "fill" : "regular"} />
        <span>{label}</span>
        <CaretDown size={13} />
      </button>
      {open ? (
        <section
          className="workflow-status-menu__popover"
          role="dialog"
          aria-label="Story progress and guidance"
        >
          <header>
            <div>
              <strong>Story progress</strong>
              <span>
                {complete} of {stages.length} steps complete
              </span>
            </div>
            {issueCount ? <mark>{issueCount}</mark> : null}
          </header>
          <WorkflowGuide
            stages={stages}
            onStageSelect={(stageId) => {
              setOpen(false);
              onStageSelect(stageId);
            }}
          />
          {guidance ? (
            <GuidancePrompt
              tone={guidance.tone}
              actionLabel={guidance.label}
              onAction={() => {
                setOpen(false);
                onGuidance(guidance.destination);
              }}
            >
              {guidance.message}
            </GuidancePrompt>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

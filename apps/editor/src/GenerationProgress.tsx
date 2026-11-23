import { useEffect, useRef, type ReactNode } from "react";
import { ActionButton, BrandSpinner } from "@earth-stories/ui";
export function GenerationProgress({
  working,
  title,
  busy,
  error,
  onCancel,
  children,
}: {
  working: boolean;
  title: string;
  busy: boolean;
  error?: string | null;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null),
    focused = useRef(false);
  useEffect(() => {
    if (!working && focused.current) {
      if (document.activeElement === document.body) heading.current?.focus();
      focused.current = false;
    }
  }, [working]);
  return (
    <section
      className={`story-creation__progress${working ? " story-creation__progress--working" : ""}`}
      role={working ? "status" : undefined}
      aria-label={working ? "Story generation" : undefined}
      aria-busy={working || undefined}
      aria-live="polite"
      onFocusCapture={() => {
        if (working) focused.current = true;
      }}
    >
      {working ? <BrandSpinner size="xl" decorative /> : null}
      <h2 ref={heading} tabIndex={-1}>
        {title}
      </h2>
      {working ? <p>Composing editable chapters and vector scenes.</p> : null}
      {error ? <p>{error}</p> : null}
      {working ? (
        <ActionButton variant="surface" disabled={busy} onClick={onCancel}>
          Cancel generation
        </ActionButton>
      ) : null}
      {children}
    </section>
  );
}

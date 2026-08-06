import type { ReactNode } from "react";
import { CaretRight } from "@phosphor-icons/react";

export function WorkspaceRow({
  number,
  title,
  description,
  meta,
  badge,
  disabled,
  actions,
  onOpen,
}: {
  number: string;
  title: string;
  description: string;
  meta: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
  actions?: ReactNode;
  onOpen: () => void;
}) {
  return (
    <div className="project-list__row">
      <button
        type="button"
        className="project-list__open"
        disabled={disabled}
        onClick={onOpen}
      >
        <span className="project-list__number">{number}</span>
        <span>
          <strong>
            {title}
            {badge}
          </strong>
          <small>{description}</small>
        </span>
        <em>{meta}</em>
        <CaretRight size={18} className="project-list__arrow" />
      </button>
      {actions ? <div className="project-list__actions">{actions}</div> : null}
    </div>
  );
}

export function DataSourceRow({
  label,
  kind,
  delivery,
  usage,
  leading,
  badge,
  onOpen,
}: {
  label: string;
  kind: string;
  delivery: ReactNode;
  usage: string;
  leading?: ReactNode;
  badge?: ReactNode;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="data-list__row"
      aria-label={`${label}, ${kind}, ${usage}`}
      onClick={onOpen}
    >
      <span className="data-list__name">
        {leading}
        <strong>{label}</strong>
        {badge}
      </span>
      <span className="data-list__type">{kind}</span>
      <span>{delivery}</span>
      <span>{usage}</span>
      <CaretRight size={18} />
    </button>
  );
}

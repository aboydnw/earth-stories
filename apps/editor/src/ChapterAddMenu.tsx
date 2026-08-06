import {
  CaretDown,
  ChartLine,
  Image,
  MapTrifold,
  Path,
  Plus,
  TextT,
  VideoCamera,
} from "@phosphor-icons/react";
import { useRef, type ReactNode } from "react";

export function ChapterAddMenu({
  open,
  canAddImage,
  canAddChart,
  onToggle,
  onAddProse,
  onAddScrolly,
  onAddMap,
  onAddImage,
  onAddVideo,
  onAddChart,
  onAddFlyover,
}: {
  open: boolean;
  canAddImage: boolean;
  canAddChart: boolean;
  onToggle: () => void;
  onAddProse: () => void;
  onAddScrolly: () => void;
  onAddMap: () => void;
  onAddImage: () => void;
  onAddVideo: () => void;
  onAddChart: () => void;
  onAddFlyover: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const enabledItems = () => [
    ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
      'button[role="menuitem"]:not([disabled])',
    ) ?? []),
  ];
  return (
    <>
      <button
        className="chapter-add__trigger"
        ref={triggerRef}
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          if (!open) onToggle();
          window.setTimeout(() => enabledItems()[0]?.focus());
        }}
      >
        <Plus size={16} /> Add chapter <CaretDown size={14} />
      </button>
      {open ? (
        <div
          ref={menuRef}
          className="chapter-add__menu"
          role="menu"
          aria-label="Chapter type"
          onKeyDown={(event) => {
            const items = enabledItems();
            const current = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            let next = current;
            if (event.key === "ArrowDown") next = (current + 1) % items.length;
            else if (event.key === "ArrowUp")
              next = (current - 1 + items.length) % items.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = items.length - 1;
            else if (event.key === "Escape") {
              event.preventDefault();
              onToggle();
              triggerRef.current?.focus();
              return;
            } else return;
            event.preventDefault();
            items[next]?.focus();
          }}
        >
          <p>Choose a chapter type</p>
          <MenuItem
            icon={<TextT size={17} />}
            title="Text"
            description="Prose, headings and links"
            onClick={onAddProse}
          />
          <MenuItem
            icon={<Path size={17} />}
            title="Guided tour"
            description="Scroll through a locked map scene"
            onClick={onAddScrolly}
          />
          <MenuItem
            icon={<MapTrifold size={17} />}
            title="Map"
            description="Interactive map and data"
            onClick={onAddMap}
          />
          <MenuItem
            icon={<Image size={17} />}
            title="Image"
            description={
              canAddImage
                ? "Imported image with caption"
                : "Import an image first"
            }
            disabled={!canAddImage}
            onClick={onAddImage}
          />
          <MenuItem
            icon={<VideoCamera size={17} />}
            title="Video"
            description="YouTube or Vimeo"
            onClick={onAddVideo}
          />
          <MenuItem
            icon={<ChartLine size={17} />}
            title="Chart"
            description={
              canAddChart ? "Visualize imported CSV data" : "Import a CSV first"
            }
            disabled={!canAddChart}
            onClick={onAddChart}
          />
          <MenuItem
            icon={<MapTrifold size={17} weight="duotone" />}
            title="Flyover"
            description="Animate between map views"
            onClick={onAddFlyover}
          />
        </div>
      ) : null}
    </>
  );
}

function MenuItem({
  icon,
  title,
  description,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button role="menuitem" type="button" disabled={disabled} onClick={onClick}>
      {icon}
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </button>
  );
}

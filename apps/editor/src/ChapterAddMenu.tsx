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
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function ChapterAddMenu({
  open,
  canAddMap,
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
  onAddDataForType,
}: {
  open: boolean;
  canAddMap: boolean;
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
  onAddDataForType?: (type: "map" | "scrolly" | "image" | "chart") => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  useEffect(() => {
    if (!open) setMoreOpen(false);
  }, [open]);
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
            description={
              canAddMap
                ? "Scroll through a locked map scene"
                : "Add map data for this chapter"
            }
            disabled={!canAddMap && !onAddDataForType}
            onClick={() =>
              canAddMap ? onAddScrolly() : onAddDataForType?.("scrolly")
            }
          />
          <MenuItem
            icon={<MapTrifold size={17} />}
            title="Map"
            description={
              canAddMap
                ? "Interactive map and data"
                : "Add map data for this chapter"
            }
            disabled={!canAddMap && !onAddDataForType}
            onClick={() => (canAddMap ? onAddMap() : onAddDataForType?.("map"))}
          />
          <MenuItem
            icon={<Image size={17} />}
            title="Image"
            description={
              canAddImage
                ? "Imported image with caption"
                : "Import an image first"
            }
            disabled={!canAddImage && !onAddDataForType}
            onClick={() =>
              canAddImage ? onAddImage() : onAddDataForType?.("image")
            }
          />
          <MenuItem
            icon={<CaretDown size={17} />}
            title="More chapter types"
            description="Video, chart, and flyover"
            id={`${moreId}-trigger`}
            ariaExpanded={moreOpen}
            ariaControls={`${moreId}-group`}
            onClick={() => setMoreOpen((value) => !value)}
          />
          {moreOpen ? (
            <div
              className="chapter-add__specialist"
              role="group"
              id={`${moreId}-group`}
              aria-labelledby={`${moreId}-trigger`}
            >
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
                  canAddChart
                    ? "Visualize imported CSV data"
                    : "Add CSV data for this chapter"
                }
                disabled={!canAddChart && !onAddDataForType}
                onClick={() =>
                  canAddChart ? onAddChart() : onAddDataForType?.("chart")
                }
              />
              <MenuItem
                icon={<MapTrifold size={17} weight="duotone" />}
                title="Flyover"
                description="Animate between map views"
                onClick={onAddFlyover}
              />
            </div>
          ) : null}
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
  id,
  ariaExpanded,
  ariaControls,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
  id?: string;
  ariaExpanded?: boolean;
  ariaControls?: string;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      type="button"
      id={id}
      disabled={disabled}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      onClick={onClick}
    >
      {icon}
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </button>
  );
}

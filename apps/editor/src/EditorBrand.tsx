import { MapTrifold } from "@phosphor-icons/react";
export function EditorBrand({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="editor-brand"
      type="button"
      onClick={onClick}
      aria-label="Return to your workspace"
    >
      <MapTrifold size={22} weight="duotone" />
      <span>Earth Stories</span>
      <small>local</small>
    </button>
  );
}

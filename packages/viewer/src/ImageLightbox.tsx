import { useEffect, useRef } from "react";

/**
 * Full-bleed view of one story image. The native dialog gives focus trapping,
 * Escape handling, and the backdrop for free; the click handler only has to
 * distinguish the backdrop itself from the figure inside it.
 */
export function ImageLightbox({
  src,
  alt,
  caption,
  onClose,
}: {
  src: string;
  alt: string;
  caption: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="story-lightbox"
      aria-label={alt}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <figure>
        <img src={src} alt={alt} />
        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
      <button
        type="button"
        className="story-lightbox__close"
        onClick={onClose}
        aria-label="Close image"
      >
        ×
      </button>
    </dialog>
  );
}

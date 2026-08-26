// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageLightbox } from "./ImageLightbox.js";

// jsdom has no dialog implementation, and a dialog without the open attribute
// keeps its contents out of the accessibility tree.
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.open = true;
});
const close = vi.fn(function (this: HTMLDialogElement) {
  this.open = false;
});

beforeEach(() => {
  showModal.mockClear();
  close.mockClear();
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;
});

afterEach(cleanup);

describe("ImageLightbox", () => {
  it("opens as a modal showing the image and its caption", () => {
    render(
      <ImageLightbox
        src="/a.png"
        alt="A field"
        caption="Spring"
        onClose={vi.fn()}
      />,
    );

    expect(showModal).toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "A field" })).toBeTruthy();
    expect(screen.getByText("Spring")).toBeTruthy();
  });

  it("closes from the close button", () => {
    const onClose = vi.fn();
    render(
      <ImageLightbox src="/a.png" alt="A field" caption="" onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close image" }));

    expect(onClose).toHaveBeenCalled();
  });
});

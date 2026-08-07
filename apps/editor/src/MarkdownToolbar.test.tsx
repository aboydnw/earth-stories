// @vitest-environment jsdom
import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownToolbar } from "./MarkdownToolbar";

afterEach(cleanup);

describe("MarkdownToolbar", () => {
  it("inserts a valid list break after an existing paragraph", () => {
    const ref = createRef<HTMLTextAreaElement>();
    const onChange = vi.fn();
    render(
      <>
        <MarkdownToolbar
          textareaRef={ref}
          value="A paragraph"
          onChange={onChange}
        />
        <textarea ref={ref} defaultValue="A paragraph" />
      </>,
    );
    ref.current?.setSelectionRange(11, 11);
    fireEvent.click(screen.getByRole("button", { name: "Bulleted list" }));
    expect(onChange).toHaveBeenCalledWith("A paragraph\n\n- List item");
  });

  it("wraps selected text with emphasis syntax", () => {
    const ref = createRef<HTMLTextAreaElement>();
    const onChange = vi.fn();
    render(
      <>
        <MarkdownToolbar
          textareaRef={ref}
          value="Make this bold"
          onChange={onChange}
        />
        <textarea ref={ref} defaultValue="Make this bold" />
      </>,
    );
    ref.current?.setSelectionRange(10, 14);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(onChange).toHaveBeenCalledWith("Make this **bold**");
  });
});

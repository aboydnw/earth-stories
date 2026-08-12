// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorViewTabs } from "./EditorViewTabs";

afterEach(cleanup);

describe("EditorViewTabs", () => {
  it("selects a region with a pointer and exposes its tabpanel relationship", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<EditorViewTabs active="chapters" onChange={onChange} />);

    const canvas = screen.getByRole("tab", { name: "Canvas" });
    expect(canvas.getAttribute("aria-controls")).toBe("editor-region-canvas");
    await user.click(canvas);

    expect(onChange).toHaveBeenCalledWith("canvas");
  });

  it("moves focus and selection with Arrow, Home, and End keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<EditorViewTabs active="canvas" onChange={onChange} />);

    const canvas = screen.getByRole("tab", { name: "Canvas" });
    canvas.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Edit" }),
    );
    expect(onChange).toHaveBeenLastCalledWith("edit");

    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Chapters" }),
    );
    expect(onChange).toHaveBeenLastCalledWith("chapters");

    await user.keyboard("{End}");
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Edit" }),
    );
    expect(onChange).toHaveBeenLastCalledWith("edit");
  });
});

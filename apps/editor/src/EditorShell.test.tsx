// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorShell } from "./EditorShell";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function matchMedia(matches: boolean) {
  return vi.fn().mockReturnValue({
    matches,
    media: "(max-width: 960px)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

describe("EditorShell", () => {
  it("renders chapters, canvas, and editor in logical desktop order", () => {
    vi.stubGlobal("matchMedia", matchMedia(false));

    render(
      <EditorShell
        region="canvas"
        onRegionChange={() => undefined}
        chapters={<span>Chapter rail</span>}
        canvas={<span>Map canvas</span>}
        inspector={<span>Chapter fields</span>}
      />,
    );

    const panels = screen.getAllByRole("region");
    expect(panels.map((panel) => panel.textContent)).toEqual([
      "Chapter rail",
      "Map canvas",
      "Chapter fields",
    ]);
  });

  it("mounts only the active panel in compact mode", () => {
    vi.stubGlobal("matchMedia", matchMedia(true));

    render(
      <EditorShell
        region="canvas"
        onRegionChange={() => undefined}
        chapters={<span>Chapter rail</span>}
        canvas={<span>Map canvas</span>}
        inspector={<span>Chapter fields</span>}
      />,
    );

    expect(screen.queryByText("Chapter rail")).toBeNull();
    expect(screen.getByText("Map canvas")).toBeTruthy();
    expect(screen.queryByText("Chapter fields")).toBeNull();
    expect(screen.getByRole("tabpanel").getAttribute("id")).toBe(
      "editor-region-canvas",
    );
  });
});

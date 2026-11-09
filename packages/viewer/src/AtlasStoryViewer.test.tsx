// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publicationManifestSchema } from "@earth-stories/story-schema";
import { StoryViewer } from "./StoryViewer.js";

vi.mock("./MapChapter.js", () => ({
  MapChapter: ({ chapter }: { chapter: { title: string } }) => (
    <div>Map: {chapter.title}</div>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});
const manifest = publicationManifestSchema.parse({
  schema: "earth-stories/publication/v1",
  build: {
    id: "atlas",
    projectId: "atlas",
    projectDigest: "a".repeat(64),
    runtimeVersion: "0.1.0",
  },
  metadata: {
    title: "Field atlas",
    description: "A reader-directed journey.",
    author: "Field team",
  },
  publication: { profile: "connected", theme: "atlas" },
  basemap: {
    id: "base",
    label: "Base",
    styleUrl: "https://example.org/style.json",
    attribution: null,
  },
  assets: [],
  chapters: [
    {
      id: "beginning",
      type: "prose",
      title: "The beginning",
      narrative: "First note.",
    },
    {
      id: "coast",
      type: "prose",
      title: "The coast",
      narrative: "Second note.",
    },
    {
      id: "evidence",
      type: "prose",
      title: "The evidence",
      narrative: "Third note.",
    },
  ],
  externalDependencies: [],
  hostingRequirements: ["static-http"],
});

describe("Illustrated Atlas reader", () => {
  it("uses real chapter links and moves focus when the reader turns a page", async () => {
    render(<StoryViewer manifest={manifest} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "The beginning",
    );
    fireEvent.click(
      screen.getByRole("link", { name: /Next chapter: The coast/ }),
    );
    expect(window.location.hash).toBe("#coast");
    expect(screen.queryByText("First note.")).toBeNull();
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("The coast");
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByText("Chapter 2 of 3")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("link", { name: /Previous chapter: The beginning/ }),
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "The beginning",
    );
  });
  it("honors deep links, malformed fragments, and browser history changes", () => {
    window.history.replaceState(null, "", "#evidence");
    render(<StoryViewer manifest={manifest} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "The evidence",
    );
    window.history.replaceState(null, "", "#coast");
    fireEvent.popState(window);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "The coast",
    );
    window.history.replaceState(null, "", "#%bad");
    fireEvent(window, new HashChangeEvent("hashchange"));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "The beginning",
    );
  });
  it("offers a complete read-all view without scroll locking", () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    render(<StoryViewer manifest={manifest} />);
    fireEvent.click(screen.getByRole("button", { name: "Read all chapters" }));
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
    fireEvent.click(
      screen.getByRole("link", { name: /Chapter 3: The evidence/ }),
    );
    expect(document.activeElement?.textContent).toBe("The evidence");
    fireEvent.click(screen.getByRole("button", { name: "Chapter view" }));
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "The evidence",
    );
  });
  it("returns to the selected chapter when its read-all link is selected again", () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    render(<StoryViewer manifest={manifest} />);
    fireEvent.click(screen.getByRole("button", { name: "Read all chapters" }));
    const link = screen.getByRole("link", { name: /Chapter 3: The evidence/ });
    fireEvent.click(link);
    const section = screen
      .getByRole("heading", { name: "The evidence" })
      .closest("section")!;
    const scroll = vi.spyOn(section, "scrollIntoView");
    scroll.mockClear();
    screen.getByRole("heading", { name: "The beginning" }).focus();
    fireEvent.click(link);
    expect(document.activeElement?.textContent).toBe("The evidence");
    expect(scroll).toHaveBeenCalledWith({
      block: "start",
      behavior: "instant",
    });
  });
  it("scrolls an offscreen new chapter into view without jumping when already visible", () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    bounds.mockReturnValue({
      top: -100,
      bottom: -60,
      left: 0,
      right: 100,
      width: 100,
      height: 40,
      x: 0,
      y: -100,
      toJSON: () => ({}),
    });
    render(<StoryViewer manifest={manifest} />);
    fireEvent.click(
      screen.getByRole("link", { name: /Next chapter: The coast/ }),
    );
    expect(scroll).toHaveBeenCalledWith({
      block: "start",
      behavior: "instant",
    });
    expect(scroll.mock.instances[0]).toBe(
      screen.getByRole("heading", { name: "The coast" }).closest("section"),
    );
    scroll.mockClear();
    bounds.mockReturnValue({
      top: 100,
      bottom: 140,
      left: 0,
      right: 100,
      width: 100,
      height: 40,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    fireEvent.click(
      screen.getByRole("link", { name: /Next chapter: The evidence/ }),
    );
    expect(scroll).not.toHaveBeenCalled();
  });
  it("leaves modified clicks to normal link behavior and snapshots all chapters", () => {
    const view = render(<StoryViewer manifest={manifest} />);
    fireEvent.click(
      screen.getByRole("link", { name: /Chapter 2: The coast/ }),
      { ctrlKey: true },
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "The beginning",
    );
    view.rerender(<StoryViewer manifest={manifest} snapshotMode />);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

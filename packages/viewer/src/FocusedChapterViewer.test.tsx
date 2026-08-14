// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { publicationManifestSchema } from "@earth-stories/story-schema";
import { FocusedChapterViewer } from "./FocusedChapterViewer.js";

afterEach(cleanup);

function manifest() {
  return publicationManifestSchema.parse({
    schema: "earth-stories/publication/v1",
    build: {
      id: "build",
      projectId: "story",
      projectDigest: "a".repeat(64),
      runtimeVersion: "0.1.0",
    },
    metadata: {
      title: "River story",
      description: "A story",
      author: null,
    },
    publication: { profile: "connected", theme: "cng" },
    basemap: {
      id: "base",
      label: "Base",
      styleUrl: "https://example.org/style.json",
      attribution: null,
    },
    assets: [],
    chapters: [
      {
        id: "arrival",
        type: "prose",
        title: "Where the river meets the city",
        narrative: "A field team followed the river corridor.",
      },
    ],
    externalDependencies: [],
    hostingRequirements: ["static-http"],
  });
}

describe("FocusedChapterViewer", () => {
  it("renders one chapter without full-story furniture", async () => {
    render(<FocusedChapterViewer manifest={manifest()} chapterId="arrival" />);

    expect(
      screen.getByRole("heading", { name: "Where the river meets the city" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/field team followed the river corridor/),
    ).toBeTruthy();
    expect(screen.queryByText("Built with Earth Stories")).toBeNull();
    expect(screen.queryByText("A geospatial field story")).toBeNull();
  });

  it("renders a bounded state when the selected chapter is unavailable", async () => {
    render(<FocusedChapterViewer manifest={manifest()} chapterId="missing" />);

    expect(screen.getByRole("status").textContent).toContain(
      "This chapter is not available in the current preview.",
    );
  });

  it("keeps an offline focused video from creating network elements", () => {
    const connected = manifest();
    const offline = {
      ...connected,
      publication: { ...connected.publication, profile: "offline" as const },
      connectivity: {
        requested: "offline" as const,
        state: "pending" as const,
      },
      chapters: [
        {
          id: "film",
          type: "video" as const,
          title: "Field film",
          narrative: "",
          provider: "youtube" as const,
          videoId: "abc",
          originalUrl: "https://youtube.com/watch?v=abc",
        },
      ],
    };

    render(<FocusedChapterViewer manifest={offline} chapterId="film" />);

    expect(screen.getByText(/Video is unavailable offline/)).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.querySelector('a[href^="http"]')).toBeNull();
  });
});

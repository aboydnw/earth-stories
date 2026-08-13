// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { publicationManifestSchema } from "@earth-stories/story-schema";
import { StoryViewer } from "./StoryViewer.js";

afterEach(cleanup);

describe("StoryViewer", () => {
  it("preserves full-story furniture and chapter numbering", () => {
    const manifest = publicationManifestSchema.parse({
      schema: "earth-stories/publication/v1",
      build: {
        id: "reader-build",
        projectId: "story",
        projectDigest: "b".repeat(64),
        runtimeVersion: "0.1.0",
      },
      metadata: {
        title: "River story",
        description: "Two views of the river.",
        author: "Field team",
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
          id: "intro",
          type: "prose",
          title: "Introduction",
          narrative: "Start here.",
        },
        {
          id: "film",
          type: "video",
          title: "Field film",
          narrative: "Watch the survey.",
          provider: "youtube",
          videoId: "abc123",
          originalUrl: "https://youtube.com/watch?v=abc123",
        },
      ],
      externalDependencies: [],
      hostingRequirements: ["static-http"],
    });

    render(<StoryViewer manifest={manifest} />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "River story",
    );
    expect(document.querySelectorAll(".story-folio")).toHaveLength(2);
    expect(screen.getByText("Built with Earth Stories")).toBeTruthy();
    expect(screen.getByTitle("Field film").getAttribute("src")).toBe(
      "https://www.youtube-nocookie.com/embed/abc123",
    );
  });

  it("renders an offline video fallback without creating a network frame or link", () => {
    const connected = publicationManifestSchema.parse({
      schema: "earth-stories/publication/v1",
      build: {
        id: "build",
        projectId: "story",
        projectDigest: "a".repeat(64),
        runtimeVersion: "0.1.0",
      },
      metadata: { title: "Offline", description: "", author: null },
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
          id: "film",
          type: "video",
          title: "Field film",
          narrative: "",
          provider: "youtube",
          videoId: "abc",
          originalUrl: "https://youtube.com/watch?v=abc",
        },
      ],
      externalDependencies: [],
      hostingRequirements: ["static-http"],
    });
    const manifest = {
      ...connected,
      publication: { ...connected.publication, profile: "offline" as const },
      connectivity: {
        requested: "offline" as const,
        state: "pending" as const,
      },
    };

    render(<StoryViewer manifest={manifest} />);

    expect(screen.getByText(/Video is unavailable offline/)).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.querySelector('a[href^="http"]')).toBeNull();
  });
});

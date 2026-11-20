// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  publicationManifestSchema,
  type ProjectChapter,
} from "@earth-stories/story-schema";
import { ChapterCanvas } from "./ChapterCanvas";

afterEach(cleanup);

const manifest = publicationManifestSchema.parse({
  schema: "earth-stories/publication/v1",
  build: {
    id: "build",
    projectId: "story",
    projectDigest: "c".repeat(64),
    runtimeVersion: "0.1.0",
  },
  metadata: { title: "Story", description: "Description", author: null },
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
      narrative: "Opening",
    },
  ],
  externalDependencies: [],
  hostingRequirements: ["static-http"],
});

describe("ChapterCanvas", () => {
  it("keeps a focused chapter canvas without inline reader mode", () => {
    render(
      <ChapterCanvas
        selectedChapter={manifest.chapters[0] as ProjectChapter}
        focusedManifest={manifest}
        savedCamera={null}
        onCameraCommit={() => undefined}
      />,
    );
    expect(screen.getByRole("heading", { name: "Introduction" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Preview story" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit chapter" })).toBeNull();
  });

  it("shows map composition actions only for map-bound chapters", () => {
    const mapChapter: ProjectChapter = {
      id: "map",
      type: "map",
      title: "Map",
      narrative: "",
      sourceId: "source",
      overlaySourceIds: [],
      camera: { center: [0, 20], zoom: 1.5, bearing: 0, pitch: 0 },
    };
    render(
      <ChapterCanvas
        selectedChapter={mapChapter}
        focusedManifest={manifest}

        savedCamera={mapChapter.camera}
        onCameraCommit={() => undefined}
      />,
    );

    expect(screen.getByText("Using automatic fit")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Use fitted view" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Reset to saved view" }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Undo view change",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("reports a non-default saved camera as a ready view", () => {
    const mapChapter: ProjectChapter = {
      id: "map",
      type: "map",
      title: "Map",
      narrative: "",
      sourceId: "source",
      overlaySourceIds: [],
      camera: { center: [-76, 39], zoom: 8, bearing: 10, pitch: 20 },
    };
    render(
      <ChapterCanvas
        selectedChapter={mapChapter}
        focusedManifest={manifest}

        savedCamera={mapChapter.camera}
        onCameraCommit={() => undefined}
      />,
    );

    expect(screen.getByText("View ready")).toBeTruthy();
    expect(screen.queryByText("Using automatic fit")).toBeNull();
  });
});

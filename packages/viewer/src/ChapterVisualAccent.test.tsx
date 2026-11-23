// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { publicationManifestSchema } from "@earth-stories/story-schema";
import { StoryViewer } from "./StoryViewer.js";
import { FocusedChapterViewer } from "./FocusedChapterViewer.js";
afterEach(cleanup);
const manifest = publicationManifestSchema.parse({
  schema: "earth-stories/publication/v3",
  build: {
    id: "b",
    projectId: "s",
    projectDigest: "b".repeat(64),
    runtimeVersion: "1",
  },
  metadata: { title: "Storm", description: "", author: null },
  publication: { profile: "connected", theme: "editorial" },
  connectivity: { requested: "connected", state: "pending" },
  dependencies: [],
  externalDependencies: [],
  hostingRequirements: ["static-http"],
  basemap: {
    delivery: "connected",
    id: "base",
    label: "Base",
    styleUrl: "https://example.org/style.json",
    attribution: null,
  },
  assets: [],
  chapters: [
    {
      id: "middle",
      type: "prose",
      title: "Intensification",
      narrative: "Original evidence.",
    },
  ],
  visualAccents: [
    {
      id: "bands",
      chapterId: "middle",
      placement: "margin",
      alt: "Gathering cloud bands",
      scene: {
        width: 1000,
        height: 500,
        layers: [
          { id: "cloud", kind: "path", pathData: "M 0 0 L 1 0 L .5 1 Z" },
        ],
      },
    },
  ],
});
it.each(["editorial", "cng", "atlas"] as const)(
  "preserves narrative and companion art in %s publications",
  (theme) => {
    render(<StoryViewer manifest={manifest} theme={theme} snapshotMode />);
    expect(screen.getByText("Original evidence.")).toBeTruthy();
    expect(
      screen.getAllByRole("img", { name: "Gathering cloud bands" }),
    ).toHaveLength(1);
  },
);
it("includes companion art in a focused chapter preview", () => {
  render(
    <FocusedChapterViewer
      manifest={manifest}
      chapterId="middle"
      snapshotMode
    />,
  );
  expect(
    screen.getByRole("img", { name: "Gathering cloud bands" }),
  ).toBeTruthy();
});

it("uses the authored still frame in a nested focused preview", async () => {
  const { visualAccentSchema } = await import("@earth-stories/story-schema");
  const { ChapterVisualContent } = await import("./ChapterVisualAccent.js");
  const accent = visualAccentSchema.parse({
    ...manifest.visualAccents![0],
    scene: {
      ...manifest.visualAccents![0]!.scene,
      staticProgress: 0.25,
      layers: [
        {
          id: "moving",
          kind: "path",
          pathData: "M 0 0 L 1 1",
          keyframes: [
            { at: 0, x: 0, y: 0, scale: 1, opacity: 1, reveal: 1 },
            { at: 1, x: 1, y: 0, scale: 1, opacity: 1, reveal: 1 },
          ],
        },
      ],
    },
  });
  const { container } = render(
    <div style={{ overflowY: "auto", height: 600 }}>
      <ChapterVisualContent accent={accent} snapshotMode>
        <a href="#source">Read source</a>
      </ChapterVisualContent>
    </div>,
  );
  expect(
    container
      .querySelector('[data-layer-id="moving"]')
      ?.getAttribute("transform"),
  ).toContain("translate(250 0)");
  expect(
    screen.getByRole("link", { name: "Read source" }).getAttribute("href"),
  ).toBe("#source");
});

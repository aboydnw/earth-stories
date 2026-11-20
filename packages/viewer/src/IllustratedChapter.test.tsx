// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { publicationSceneSchema } from "@earth-stories/story-schema";
import { IllustratedChapter } from "./IllustratedChapter.js";
afterEach(cleanup);
const scene = publicationSceneSchema.parse({
  width: 1000,
  height: 600,
  staticProgress: 0.75,
  layers: [
    {
      id: "label",
      kind: "text",
      text: "River",
      keyframes: [
        { at: 0, x: 0, y: 0, scale: 1, opacity: 1, reveal: 1 },
        { at: 1, x: 1, y: 0, scale: 1, opacity: 1, reveal: 1 },
      ],
    },
    { id: "art", kind: "image", assetId: "missing", alt: "River banks" },
  ],
});
const chapter = {
  id: "scene",
  type: "illustrated" as const,
  title: "Water",
  narrative: "",
  alt: "River reaching the sea",
  caption: "An illustration",
  scene,
};
it("renders accessible descriptions and missing artwork explicitly", () => {
  render(
    <IllustratedChapter
      chapter={chapter}
      assets={new Map()}
      previewProgress={0.5}
    />,
  );
  expect(
    screen.getByRole("img", { name: "River reaching the sea" }),
  ).toBeTruthy();
  expect(screen.getByText("River")).toBeTruthy();
  expect(screen.getByText(/Artwork unavailable: River banks/)).toBeTruthy();
  expect(
    document
      .querySelector('[data-layer-id="label"]')
      ?.getAttribute("transform"),
  ).toContain("500");
});
it("uses the static frame for snapshots and reduced motion", () => {
  const { unmount } = render(
    <IllustratedChapter
      chapter={chapter}
      assets={new Map()}
      previewProgress={0}
      snapshotMode
    />,
  );
  expect(
    document
      .querySelector('[data-layer-id="label"]')
      ?.getAttribute("transform"),
  ).toContain("750");
  unmount();
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  render(
    <IllustratedChapter
      chapter={chapter}
      assets={new Map()}
      previewProgress={0}
    />,
  );
  expect(
    document
      .querySelector('[data-layer-id="label"]')
      ?.getAttribute("transform"),
  ).toContain("750");
  vi.unstubAllGlobals();
});

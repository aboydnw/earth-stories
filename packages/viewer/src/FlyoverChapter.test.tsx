// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicationChapter } from "@earth-stories/story-schema";

let updateScroll: ((progress: number) => void) | undefined;
vi.mock("./useFlyoverScroll.js", () => ({
  useFlyoverScroll: (
    _ref: unknown,
    _count: number,
    update: (progress: number) => void,
  ) => {
    updateScroll = update;
  },
}));
vi.mock("./MapChapter.js", () => ({
  MapChapter: ({
    chapter,
    interactive,
    followCamera,
  }: {
    chapter: { camera: { zoom: number } };
    interactive?: boolean;
    followCamera?: boolean;
  }) => (
    <div
      data-testid="map"
      data-interactive={String(interactive)}
      data-follow={String(followCamera)}
      data-zoom={String(chapter.camera.zoom)}
    />
  ),
}));

import { FlyoverChapter } from "./FlyoverChapter.js";

afterEach(() => {
  cleanup();
  updateScroll = undefined;
});

const chapter = {
  id: "flight",
  type: "flyover",
  title: "Flight",
  narrative: "Follow the river",
  assetId: null,
  overlayAssetIds: [],
  scrollLength: 1,
  keyframes: [
    { center: [0, 0], zoom: 2, bearing: 0, pitch: 0, caption: "River mouth" },
    { center: [1, 1], zoom: 4, bearing: 20, pitch: 30, caption: "Wetlands" },
    { center: [2, 2], zoom: 6, bearing: 40, pitch: 40, caption: "Headwaters" },
  ],
} as Extract<PublicationChapter, { type: "flyover" }>;

describe("FlyoverChapter", () => {
  it("shows keyframe captions and uses guarded camera following in authoring", () => {
    render(
      <FlyoverChapter
        chapter={chapter}
        asset={null}
        overlayAssets={[]}
        basemapStyle="https://example.com/style.json"
        interactive
      />,
    );
    expect(screen.getByText("River mouth")).toBeTruthy();
    act(() => updateScroll?.(0.6));
    expect(screen.getByText("Wetlands")).toBeTruthy();
    expect(screen.getByTestId("map").getAttribute("data-interactive")).toBe(
      "true",
    );
    expect(screen.getByTestId("map").getAttribute("data-follow")).toBe("true");
  });

  it("preserves preview progress when keyframes are edited", () => {
    const { rerender } = render(
      <FlyoverChapter
        chapter={chapter}
        asset={null}
        overlayAssets={[]}
        basemapStyle="https://example.com/style.json"
      />,
    );
    act(() => updateScroll?.(0.6));
    const previewZoom = screen.getByTestId("map").getAttribute("data-zoom");
    expect(previewZoom).not.toBe("2");

    rerender(
      <FlyoverChapter
        chapter={{
          ...chapter,
          keyframes: chapter.keyframes.map((keyframe, index) =>
            index === 1
              ? { ...keyframe, caption: "Edited wetlands" }
              : keyframe,
          ),
        }}
        asset={null}
        overlayAssets={[]}
        basemapStyle="https://example.com/style.json"
      />,
    );

    expect(screen.getByTestId("map").getAttribute("data-zoom")).toBe(
      previewZoom,
    );
  });
});

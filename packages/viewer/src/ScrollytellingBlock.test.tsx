// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import {
  publicationChapterSchema,
  publicationVisualAccentSchema,
} from "@earth-stories/story-schema";
import { ScrollytellingBlock } from "./ScrollytellingBlock.js";
vi.mock("./MapChapter.js", () => ({
  MapChapter: () => <div data-testid="shared-map" />,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("keeps companion art outside overlay cards while retaining one shared map", () => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const chapters = ["first", "second"]
    .map((id) =>
      publicationChapterSchema.parse({
        id,
        type: "scrolly",
        title: id,
        narrative: `Original ${id}`,
        assetId: "map",
        overlayAssetIds: [],
        transition: "instant",
        overlayPosition: "left",
        camera: { center: [0, 0], zoom: 2, bearing: 0, pitch: 0 },
      }),
    )
    .map((c) => {
      if (c.type !== "scrolly") throw Error("Invalid fixture");
      return c;
    });
  const accent = publicationVisualAccentSchema.parse({
    id: "companion",
    chapterId: "first",
    placement: "trailing",
    alt: "Illustrative clouds",
    scene: {
      width: 1000,
      height: 500,
      layers: [{ id: "cloud", kind: "path", pathData: "M 0 0 L 1 0 L .5 1 Z" }],
    },
  });
  const { container } = render(
    <ScrollytellingBlock
      chapters={chapters}
      startIndex={0}
      assets={new Map()}
      basemapStyle="/style.json"
      runtimePolicy={{
        offline: false,
        runtimeAssets: [],
        projectionDefinitions: [],
        dependencies: [],
      }}
      visualAccents={[accent]}
      snapshotMode
    />,
  );
  expect(
    screen
      .getByRole("img", { name: "Illustrative clouds" })
      .closest(".story-scrolly__card"),
  ).toBeNull();
  expect(screen.getAllByTestId("shared-map")).toHaveLength(1);
  expect(container.querySelectorAll("[data-scrolly-step]")).toHaveLength(2);
  expect(screen.getAllByText("Original first")).toHaveLength(1);
});

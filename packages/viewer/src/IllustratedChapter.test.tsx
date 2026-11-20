// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
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

it("tracks the containing scrollport and recalculates progress after resize", () => {
  const rect = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      return {
        top: this.classList.contains("story-illustration__track") ? -500 : 100,
        height: this.classList.contains("story-illustration__track")
          ? 2000
          : 1000,
        left: 0,
        right: 1000,
        bottom: 2000,
        width: 1000,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      };
    });
  let height = 1000;
  const size = vi
    .spyOn(HTMLElement.prototype, "clientHeight", "get")
    .mockImplementation(() => height);
  const raf = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  const { unmount } = render(
    <div style={{ overflowY: "auto" }}>
      <IllustratedChapter chapter={chapter} assets={new Map()} />
    </div>,
  );
  expect(
    document
      .querySelector('[data-layer-id="label"]')
      ?.getAttribute("transform"),
  ).toContain("600");
  height = 500;
  // The resize event is delivered through the same animation-frame scheduler as scroll.
  fireEvent(window, new Event("resize"));
  expect(
    document
      .querySelector('[data-layer-id="label"]')
      ?.getAttribute("transform"),
  ).toContain("400");
  unmount();
  rect.mockRestore();
  size.mockRestore();
  raf.mockRestore();
});

it('explains an image that fails to load even when the manifest contains it',()=>{
 const assets=new Map([['missing',{id:'missing',kind:'image',href:'/broken.png'} as never]]);
 render(<IllustratedChapter chapter={chapter} assets={assets} snapshotMode/>);
 fireEvent.error(document.querySelector('svg image')!);
 expect(screen.getByText('Artwork unavailable: River banks')).toBeTruthy();
});

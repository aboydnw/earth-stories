// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VisualSequence } from "./VisualSequence.js";
import { visualSequenceSchema } from "@earth-stories/story-schema";
const visualFixtureChapters = [
  {
    id: "arrival",
    type: "prose" as const,
    title: "A boundary in motion",
    narrative: "First",
  },
  {
    id: "change",
    type: "prose" as const,
    title: "The next stage",
    narrative: "Second",
  },
];
const hurricaneSequence = visualSequenceSchema.parse({
  id: "storm",
  alt: "Hurricane",
  caption: "Illustrative",
  scene: {
    width: 1000,
    height: 800,
    layers: [
      {
        id: "cloud-band-0",
        kind: "path",
        pathData: "M 0 0 L 1 0 L .5 1 Z",
        keyframes: [
          { at: 0, x: 0, y: 0, scale: 1, opacity: 1, reveal: 1, rotation: 0 },
          { at: 1, x: 0, y: 0, scale: 1, opacity: 1, reveal: 1, rotation: 90 },
        ],
      },
    ],
  },
  steps: [
    { chapterId: "arrival", start: 0, end: 0.5 },
    { chapterId: "change", start: 0.5, end: 1 },
  ],
});

import { groupChaptersIntoBlocks } from "./chapterBlocks.js";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("renders narrative exactly once and scrubs the selected step", () => {
  render(
    <VisualSequence
      sequence={hurricaneSequence}
      chapters={visualFixtureChapters}
      focusedChapterId="change"
    />,
  );
  expect(screen.queryByText("A boundary in motion")).toBeNull();
  expect(screen.getByText("The next stage")).toBeTruthy();
  const svg = screen.getByRole("img");
  const before = svg
    .querySelector('[data-layer-id="cloud-band-0"]')!
    .getAttribute("transform");
  fireEvent.change(screen.getByRole("slider"), { target: { value: "0.5" } });
  expect(
    svg
      .querySelector('[data-layer-id="cloud-band-0"]')!
      .getAttribute("transform"),
  ).not.toBe(before);
});
it("provides stills and every narrative step with reduced motion", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  render(
    <VisualSequence
      sequence={hurricaneSequence}
      chapters={visualFixtureChapters}
    />,
  );
  expect(screen.getAllByRole("img")).toHaveLength(2);
  expect(screen.getByText("The next stage")).toBeTruthy();
  expect(screen.queryByRole("slider")).toBeNull();
});
it("groups sequences without dropping the chapter after them", () => {
  const chapters = [
    ...visualFixtureChapters,
    {
      id: "after",
      type: "prose" as const,
      title: "After",
      narrative: "Still here",
    },
  ];
  const blocks = groupChaptersIntoBlocks(chapters, [hurricaneSequence]);
  expect(blocks.map((b) => b.type)).toEqual(["visual", "chapter"]);
  expect(blocks[1]).toMatchObject({ chapter: { id: "after" } });
});

it("scrubs against a nested editor scrollport rather than the browser window", async () => {
  const { waitFor } = await import("@testing-library/react");
  const { container } = render(
    <div style={{ overflowY: "auto", height: 400 }}>
      <VisualSequence
        sequence={hurricaneSequence}
        chapters={visualFixtureChapters}
      />
    </div>,
  );
  const scrollport = container.firstElementChild as HTMLElement;
  Object.defineProperty(scrollport, "clientHeight", { value: 400 });
  scrollport.getBoundingClientRect = () =>
    ({ top: 100, height: 400 }) as DOMRect;
  const steps = Array.from(
    container.querySelectorAll<HTMLElement>("[data-visual-step]"),
  );
  steps[0]!.getBoundingClientRect = () =>
    ({ top: -300, height: 400 }) as DOMRect;
  steps[1]!.getBoundingClientRect = () =>
    ({ top: 100, height: 400 }) as DOMRect;
  fireEvent.scroll(scrollport);
  await waitFor(() =>
    expect(
      container
        .querySelector('[data-layer-id="cloud-band-0"]')
        ?.getAttribute("transform"),
    ).toContain("rotate(67.5"),
  );
});

it("honors an authored still frame within each chapter interval", () => {
  const { container } = render(
    <VisualSequence
      sequence={{
        ...hurricaneSequence,
        scene: { ...hurricaneSequence.scene, staticProgress: 0.25 },
      }}
      chapters={visualFixtureChapters}
      snapshotMode
    />,
  );
  const layers = container.querySelectorAll('[data-layer-id="cloud-band-0"]');
  expect(layers[0]?.getAttribute("transform")).toContain("rotate(22.5");
  expect(layers[1]?.getAttribute("transform")).toContain("rotate(45");
});

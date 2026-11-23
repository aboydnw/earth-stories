// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EarthStoriesProvider } from "@earth-stories/ui";
import {
  visualAccentSchema,
  reconcileVisualAccents,
} from "@earth-stories/story-schema";
import { VisualAccentInspector } from "./VisualAccentInspector";
afterEach(cleanup);
const accent = visualAccentSchema.parse({
  id: "cloud",
  chapterId: "map",
  placement: "margin",
  alt: "Clouds",
  scene: {
    width: 1000,
    height: 500,
    layers: [{ id: "cloud", kind: "path", pathData: "M 0 0 L 1 0 L .5 1 Z" }],
  },
});
it("edits placement without saving an empty description and removes only the accent", () => {
  const change = vi.fn(),
    remove = vi.fn();
  render(
    <EarthStoriesProvider>
      <VisualAccentInspector
        accent={accent}
        onChange={change}
        onRemove={remove}
      />
    </EarthStoriesProvider>,
  );
  fireEvent.change(screen.getByLabelText(/Alternative description/), {
    target: { value: "" },
  });
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Artwork placement"), {
    target: { value: "trailing" },
  });
  expect(visualAccentSchema.parse(change.mock.calls[0]![0])).toMatchObject({
    placement: "trailing",
    alt: "Clouds",
    chapterId: "map",
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Remove companion artwork" }),
  );
  expect(remove).toHaveBeenCalledOnce();
});
it("retains art on reorder and removes orphaned chapter references", () => {
  expect(
    reconcileVisualAccents([{ id: "other" }, { id: "map" }], [accent]),
  ).toEqual([accent]);
  expect(reconcileVisualAccents([{ id: "other" }], [accent])).toEqual([]);
});

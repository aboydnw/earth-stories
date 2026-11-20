import {
  defaultReaderPalette,
  resolveReaderPalette,
} from "@earth-stories/story-schema";
// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EarthStoriesProvider } from "@earth-stories/ui";
import { ReaderPaletteEditor } from "./ReaderPaletteEditor";
afterEach(cleanup);
it("changes only the selected reader color and permits a reset", () => {
  const onChange = vi.fn();
  render(
    <EarthStoriesProvider>
      <ReaderPaletteEditor
        value={{ text: defaultReaderPalette.text }}
        onChange={onChange}
      />
    </EarthStoriesProvider>,
  );
  fireEvent.change(screen.getByLabelText("Background"), {
    target: { value: defaultReaderPalette.surface },
  });
  expect(onChange).toHaveBeenLastCalledWith({
    text: defaultReaderPalette.text,
    background: defaultReaderPalette.surface,
  });
  fireEvent.click(screen.getByRole("button", { name: "Use theme colors" }));
  expect(onChange).toHaveBeenLastCalledWith(undefined);
});

it("shows the active theme defaults alongside authored overrides", () => {
  render(
    <EarthStoriesProvider>
      <ReaderPaletteEditor
        theme="atlas"
        value={{ accent: defaultReaderPalette.text }}
        onChange={() => {}}
      />
    </EarthStoriesProvider>,
  );
  expect((screen.getByLabelText("Text") as HTMLInputElement).value).toBe(
    resolveReaderPalette({}, "atlas").text,
  );
  expect((screen.getByLabelText("Surface") as HTMLInputElement).value).toBe(
    resolveReaderPalette({}, "atlas").surface,
  );
  expect((screen.getByLabelText("Accent") as HTMLInputElement).value).toBe(
    defaultReaderPalette.text,
  );
});

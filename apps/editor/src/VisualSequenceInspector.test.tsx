// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EarthStoriesProvider } from "@earth-stories/ui";
import { VisualSequenceInspector } from "./VisualSequenceInspector";
import {
  glacierSequence,
  visualFixtureChapters,
} from "./visualSequenceFixtures";
afterEach(cleanup);
it("keeps the last valid description while explaining an empty draft", () => {
  const onChange = vi.fn();
  render(
    <EarthStoriesProvider>
      <VisualSequenceInspector
        sequence={glacierSequence}
        chapters={visualFixtureChapters}
        onChange={onChange}
        onRemove={() => {}}
        onInspect={() => {}}
      />
    </EarthStoriesProvider>,
  );
  const input = screen.getByLabelText(/Alternative description/);
  fireEvent.change(input, { target: { value: "" } });
  expect(onChange).not.toHaveBeenCalled();
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByText(/Enter a description/)).toBeTruthy();
  fireEvent.change(input, {
    target: { value: "Ice retreats into the valley." },
  });
  expect(onChange).toHaveBeenLastCalledWith({
    ...glacierSequence,
    alt: "Ice retreats into the valley.",
  });
  expect(input.getAttribute("aria-invalid")).not.toBe("true");
});

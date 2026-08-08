// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TemporalControls } from "./TemporalControls.js";

describe("TemporalControls", () => {
  it("selects a timestep from the date menu", () => {
    const onScrub = vi.fn();
    render(
      <TemporalControls
        position={0}
        label="2000-07-06 12:00 UTC"
        playing={false}
        speed={1}
        stepCount={3}
        timesteps={[
          { label: "2000-07-06 12:00 UTC", index: 9000 },
          { label: "2000-07-06 12:30 UTC", index: 9001 },
          { label: "2000-07-06 13:00 UTC", index: 9002 },
        ]}
        onScrub={onScrub}
        onStep={vi.fn()}
        onToggle={vi.fn()}
        onSpeed={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Select date" }));
    fireEvent.click(
      screen.getByRole("option", { name: "2000-07-06 13:00 UTC" }),
    );
    expect(onScrub).toHaveBeenCalledWith(1);
  });

  it("shows a plain time label when there are no timesteps to pick", () => {
    const { container } = render(
      <TemporalControls
        position={0}
        label="00:12"
        playing={false}
        speed={1}
        onScrub={vi.fn()}
        onStep={vi.fn()}
        onToggle={vi.fn()}
        onSpeed={vi.fn()}
      />,
    );
    const control = within(container);
    expect(control.queryByRole("button", { name: "Select date" })).toBeNull();
    expect(container.querySelector(".story-map__time-date")?.textContent).toBe(
      "00:12",
    );
  });
});

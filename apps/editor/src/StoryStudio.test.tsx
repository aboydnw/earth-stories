// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import originalFrontsRaw from "../../local-service/src/example-assets/example-edge-of-ice/kronebreen-fronts.geojson?raw";
import studioFrontsRaw from "./storyStudioFronts.json?raw";
import { StoryStudio } from "./StoryStudio";
import { studioFrame, studioTreatments } from "./storyStudioMotion";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("finishes framing motion before exposing any observation", () => {
  const variant = studioTreatments.shoreline;
  expect(studioFrame(variant, 0).scale).toBeGreaterThan(
    studioFrame(variant, 0.3).scale,
  );
  expect(studioFrame(variant, 0.55)).toMatchObject({ scale: 1, first: false });
  expect(studioFrame(variant, 0.62)).toMatchObject({
    first: true,
    last: false,
    gap: false,
  });
  expect(studioFrame(variant, 1)).toMatchObject({
    first: true,
    last: true,
    gap: true,
  });
});

it("switches variants at the same moment and restores the prior variant on undo", async () => {
  const user = userEvent.setup();
  render(<StoryStudio onClose={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Shoreline" }));
  await user.click(
    screen.getByRole("button", { name: "Sketch alternatives for shoreline" }),
  );
  await user.click(screen.getByRole("button", { name: /House as landmark/ }));
  const shoreline = screen.getByRole("button", { name: /Shoreline as anchor/ });
  const slider = screen.getByRole("slider", {
    name: "Rehearsal position",
  }) as HTMLInputElement;
  fireEvent.change(slider, { target: { value: "68" } });
  await user.click(shoreline);
  expect(slider.value).toBe("68");
  screen.getByRole("button", { name: "Remix house + staggered dates" }).focus();
  await user.keyboard("{Enter}");
  screen.getByRole("button", { name: "Undo remix" }).focus();
  await user.keyboard("{Enter}");
  expect(shoreline.getAttribute("aria-pressed")).toBe("true");
  expect(slider.value).toBe("68");
});

it("presents both sourced observations and the gap without autoplay in reduced motion", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const { container } = render(<StoryStudio onClose={vi.fn()} />);
  expect(
    (screen.getByRole("button", { name: "Play" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.getByText(/March to July 2015 and December 2015/)).toBeTruthy();
  for (const month of ["2015-01", "2024-12"]) {
    expect(
      container
        .querySelector('[data-observation="' + month + '"]')
        ?.getAttribute("opacity"),
    ).toBe("1");
  }
});

it("matches the original sourced endpoint features exactly", () => {
  const source = JSON.parse(originalFrontsRaw) as {
    features: { properties: { month: string } }[];
  };
  expect(JSON.parse(studioFrontsRaw).features).toEqual(
    source.features.filter(({ properties }) =>
      ["2015-01", "2024-12"].includes(properties.month),
    ),
  );
});

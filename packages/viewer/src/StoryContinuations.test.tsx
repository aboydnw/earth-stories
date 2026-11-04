// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StoryContinuations } from "./StoryContinuations.js";

describe("StoryContinuations", () => {
  it("offers a safe external handoff to GeoLibre", () => {
    render(
      <StoryContinuations
        continuations={[
          {
            kind: "geolibre",
            label: "Open in GeoLibre",
            href: "https://web.geolibre.app/?url=https%3A%2F%2Fexample.org%2Fstory%2Fexplore%2Fstory.geolibre.json",
            projectHref: "explore/story.geolibre.json",
          },
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: "Open in GeoLibre" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
    expect(screen.getByText(/open-source GeoLibre workspace/i)).toBeTruthy();
  });

  it("renders nothing without a continuation", () => {
    const { container } = render(<StoryContinuations continuations={[]} />);
    expect(container.innerHTML).toBe("");
  });
});

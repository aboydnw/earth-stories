// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UnavailableAuthoring } from "./UnavailableAuthoring";

describe("UnavailableAuthoring", () => {
  it("describes the honest hosted-browser boundary", () => {
    render(<UnavailableAuthoring />);
    expect(
      screen.getByText("Earth Stories authoring requires the desktop app."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Published stories remain ordinary websites and work in your browser.",
      ),
    ).toBeTruthy();
  });
});

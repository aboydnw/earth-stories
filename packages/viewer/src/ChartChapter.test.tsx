// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicationChapter } from "@earth-stories/story-schema";
import { ChartChapter } from "./ChartChapter.js";
import { publicationAsset } from "./testFixtures.js";

vi.mock("./chartData.js", () => ({
  loadChartSeries: vi.fn(async () => [
    {
      name: "value",
      points: [
        { label: "2026-01", value: 100 },
        { label: "2026-02", value: 110 },
      ],
    },
  ]),
}));

afterEach(() => cleanup());

const chapter = {
  id: "prices",
  type: "chart",
  title: "Prices",
  narrative: "",
  assetId: "prices",
  chartType: "line",
  series: { kind: "table" },
  xColumn: "month",
  yColumn: "value",
  xLabel: "Month",
  yLabel: "Value",
} as Extract<PublicationChapter, { type: "chart" }>;

describe("ChartChapter", () => {
  it("stretches a line plot across the available chart width", async () => {
    render(
      <ChartChapter
        chapter={chapter}
        asset={publicationAsset({ id: "prices", kind: "csv" })}
      />,
    );

    const plot = await screen.findByRole("img");
    expect(plot.getAttribute("viewBox")).toBe("0 0 100 28");
    expect(plot.hasAttribute("preserveAspectRatio")).toBe(false);
  });
});

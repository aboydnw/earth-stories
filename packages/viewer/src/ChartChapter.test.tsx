// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicationChapter } from "@earth-stories/story-schema";
import { loadChartSeries } from "./chartData.js";
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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
  it("renders all series on a shared domain and exposes exact values", async () => {
    vi.mocked(loadChartSeries).mockResolvedValueOnce([
      {
        name: "wind",
        points: [
          { label: "0", value: 10 },
          { label: "10", value: 20 },
        ],
      },
      { name: "gust", points: [{ label: "2", value: 15 }] },
    ]);
    const { container } = render(
      <ChartChapter
        chapter={chapter}
        asset={publicationAsset({ id: "prices", kind: "csv" })}
      />,
    );
    await screen.findByText("wind", { selector: "li" });
    const markers = container.querySelectorAll("circle");
    expect(markers).toHaveLength(3);
    expect(Number(markers[2]!.getAttribute("cx"))).toBeCloseTo(169.6);
    expect(container.querySelector("table")?.textContent).toContain("gust215");
    expect(screen.getByText("View chart data")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "Value by Month",
    );
  });
  it("stretches a line plot across the available chart width", async () => {
    render(
      <ChartChapter
        chapter={chapter}
        asset={publicationAsset({ id: "prices", kind: "csv" })}
      />,
    );

    const plot = await screen.findByRole("img");
    expect(plot.getAttribute("viewBox")).toBe("0 0 640 280");
    expect(plot.hasAttribute("preserveAspectRatio")).toBe(false);
  });
});

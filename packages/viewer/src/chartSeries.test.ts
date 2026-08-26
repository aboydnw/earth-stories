import { describe, expect, it } from "vitest";
import { histogramPoints, timeseriesPoints } from "./chartSeries.js";

describe("histogramPoints", () => {
  it("bins values into equal-width buckets labelled by range", () => {
    const [series] = histogramPoints([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 2);

    expect(series!.points.map((point) => point.value)).toEqual([5, 6]);
    expect(series!.points[0]!.label).toBe("0–5");
    expect(series!.points[1]!.label).toBe("5–10");
  });

  it("ignores non-finite samples and returns an empty series when none remain", () => {
    expect(histogramPoints([Number.NaN], 4)[0]!.points).toEqual([]);
  });

  it("keeps a usable bucket width when every sample is identical", () => {
    const [series] = histogramPoints([7, 7, 7], 3);

    expect(
      series!.points.reduce((total, point) => total + point.value, 0),
    ).toBe(3);
  });
});

describe("timeseriesPoints", () => {
  it("pairs labels with values and skips non-finite samples", () => {
    const [series] = timeseriesPoints(
      ["2020", "2021", "2022"],
      [1, Number.NaN, 3],
    );

    expect(series!.points).toEqual([
      { label: "2020", value: 1 },
      { label: "2022", value: 3 },
    ]);
  });
});

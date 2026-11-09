import { describe, expect, it } from "vitest";
import type { PublicationChapter } from "@earth-stories/story-schema";
import {
  chartXDomain,
  histogramPoints,
  timeseriesPoints,
  tablePoints,
} from "./chartSeries.js";

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

describe("chartXDomain", () => {
  const series = (labels: string[]) => ({
    name: "value",
    points: labels.map((label) => ({ label, value: 1 })),
  });
  it("uses elapsed time for irregular landfall fixes", () => {
    const domain = chartXDomain([
      series([
        "2005-08-29T06:00:00Z",
        "2005-08-29T11:10:00Z",
        "2005-08-29T12:00:00Z",
      ]),
    ]);
    expect(domain.kind).toBe("time");
    expect(domain.position("2005-08-29T11:10:00Z")).toBeCloseTo(310 / 360);
  });
  it("shares one time domain between series with missing points", () => {
    const domain = chartXDomain([
      series(["2026-01-01", "2026-01-03"]),
      series(["2026-01-02", "2026-01-03"]),
    ]);
    expect(domain.position("2026-01-02")).toBe(0.5);
    expect(domain.position("2026-01-03")).toBe(1);
  });
  it("uses numeric distances rather than sample positions", () => {
    const domain = chartXDomain([series(["0", "1", "10"])]);
    expect(domain.kind).toBe("number");
    expect(domain.position("1")).toBe(0.1);
  });
  it("keeps positions finite across extreme numeric endpoints", () => {
    const domain = chartXDomain([series(["-1e308", "0", "1e308"])]);
    expect(domain.position("-1e308")).toBe(0);
    expect(domain.position("0")).toBe(0.5);
    expect(domain.position("1e308")).toBe(1);
  });

  it("centers singleton and identical numeric coordinates", () => {
    expect(chartXDomain([series(["2026-01-01"])]).position("2026-01-01")).toBe(
      0.5,
    );
    expect(chartXDomain([series(["1", "1.0"])]).position("1")).toBe(0.5);
    expect(chartXDomain([]).ticks).toEqual([]);
  });
  it("shares category order without parsing ambiguous dates", () => {
    const domain = chartXDomain([
      series(["May", "June"]),
      series(["June", "July"]),
    ]);
    expect(domain.kind).toBe("category");
    expect(domain.position("June")).toBe(0.5);
    expect(chartXDomain([series(["01/02/2026", "02/03/2026"])]).kind).toBe(
      "category",
    );
    expect(chartXDomain([series(["2026-02-30", "2026-03-01"])]).kind).toBe(
      "category",
    );
    expect(
      chartXDomain([series(["2026-01-01T12:00:00", "2026-01-02T12:00:00"])])
        .kind,
    ).toBe("category");
  });
  it("normalizes explicit offsets and accepts ISO months", () => {
    const domain = chartXDomain([
      series([
        "2026-01-01T00:00:00Z",
        "2026-01-01T02:00:00+01:00",
        "2026-01-01T02:00:00Z",
      ]),
    ]);
    expect(domain.position("2026-01-01T02:00:00+01:00")).toBe(0.5);
    expect(chartXDomain([series(["2026-01", "2026-02"])]).kind).toBe("time");
  });
});

it("keeps empty CSV cells missing rather than plotting a false zero", () => {
  const chapter = {
    xColumn: "time",
    yColumn: "wind",
    yColumns: [],
    xMin: null,
    xMax: null,
    yScale: "linear",
  } as unknown as Extract<PublicationChapter, { type: "chart" }>;
  expect(
    tablePoints(
      [
        { time: "0", wind: "" },
        { time: "1", wind: "0" },
        { time: "2", wind: " " },
      ],
      chapter,
    )[0]!.points,
  ).toEqual([{ label: "1", value: 0 }]);
});

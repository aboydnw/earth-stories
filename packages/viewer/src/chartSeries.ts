import type { PublicationChapter } from "@earth-stories/story-schema";

export interface ChartPoint {
  label: string;
  value: number;
}

export interface ChartSeriesData {
  name: string;
  points: ChartPoint[];
}

type ChartChapter = Extract<PublicationChapter, { type: "chart" }>;

const MAX_TABLE_POINTS = 80;

function formatEdge(value: number) {
  return Number.isInteger(value) ? String(value) : value.toPrecision(3);
}

/** Bin raster samples into equal-width buckets labelled by their value range. */
export function histogramPoints(
  values: ArrayLike<number>,
  bins: number,
): ChartSeriesData[] {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    if (!Number.isFinite(value)) continue;
    if (value < minimum) minimum = value;
    if (value > maximum) maximum = value;
  }
  if (!Number.isFinite(minimum)) return [{ name: "histogram", points: [] }];
  const width = (maximum - minimum) / bins || 1;
  const counts = new Array<number>(bins).fill(0);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    if (!Number.isFinite(value)) continue;
    const bucket = Math.min(bins - 1, Math.floor((value - minimum) / width));
    counts[bucket] += 1;
  }
  return [
    {
      name: "histogram",
      points: counts.map((count, index) => ({
        label: `${formatEdge(minimum + index * width)}–${formatEdge(
          minimum + (index + 1) * width,
        )}`,
        value: count,
      })),
    },
  ];
}

/** Pair timestep labels with sampled values, dropping gaps in the record. */
export function timeseriesPoints(
  labels: string[],
  values: number[],
): ChartSeriesData[] {
  return [
    {
      name: "timeseries",
      points: labels.flatMap((label, index) =>
        Number.isFinite(values[index])
          ? [{ label, value: values[index]! }]
          : [],
      ),
    },
  ];
}

/** Read the chapter's configured columns out of parsed CSV rows. */
export function tablePoints(
  rows: Record<string, string>[],
  chapter: ChartChapter,
): ChartSeriesData[] {
  const columns = [chapter.yColumn, ...chapter.yColumns].filter(
    (value, index, all) => all.indexOf(value) === index,
  );
  const withinBound = (
    raw: string,
    bound: string | number | null,
    lower: boolean,
  ) => {
    if (bound === null) return true;
    if (typeof bound === "number") {
      const value = Number(raw);
      return (
        Number.isFinite(value) && (lower ? value >= bound : value <= bound)
      );
    }
    return lower ? raw >= bound : raw <= bound;
  };
  return columns.map((column) => ({
    name: column,
    points: rows
      .filter((row) =>
        withinBound(row[chapter.xColumn] ?? "", chapter.xMin, true),
      )
      .filter((row) =>
        withinBound(row[chapter.xColumn] ?? "", chapter.xMax, false),
      )
      .map((row) => ({
        label: row[chapter.xColumn] ?? "",
        value: Number(row[column]),
      }))
      .filter(
        (point) =>
          Number.isFinite(point.value) &&
          (chapter.yScale !== "log" || point.value > 0),
      )
      .slice(0, MAX_TABLE_POINTS),
  }));
}

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
        value: row[column]?.trim() ? Number(row[column]) : NaN,
      }))
      .filter(
        (point) =>
          Number.isFinite(point.value) &&
          (chapter.yScale !== "log" || point.value > 0),
      )
      .slice(0, MAX_TABLE_POINTS),
  }));
}

/** Parse only unambiguous ISO dates, never category names or locale dates. */
function isoTime(label: string): number {
  const match =
    /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/.exec(
      label,
    );
  if (!match || (match[4] && !match[3])) return NaN;
  const [, year, month, day = "01"] = match;
  const date = `${year}-${month}-${day}`;
  const midnight = Date.parse(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(midnight) ||
    new Date(midnight).toISOString().slice(0, 10) !== date
  )
    return NaN;
  if (
    match[4] &&
    (Number(match[4]) > 23 ||
      Number(match[5]) > 59 ||
      Number(match[6] ?? 0) > 59)
  )
    return NaN;
  return match[4] ? Date.parse(label) : midnight;
}

export interface ChartXDomain {
  kind: "number" | "time" | "category";
  position: (label: string) => number;
  ticks: { label: string; position: number }[];
}

/** A shared domain keeps missing samples and irregular time intervals honest. */
export function chartXDomain(series: ChartSeriesData[]): ChartXDomain {
  const labels = [
    ...new Set(
      series.flatMap((item) => item.points.map((point) => point.label)),
    ),
  ];
  const numeric = labels.map((label) =>
    label.trim() &&
    /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(label.trim())
      ? Number(label)
      : NaN,
  );
  const dates = labels.map(isoTime);
  const kind =
    labels.length && numeric.every(Number.isFinite)
      ? "number"
      : labels.length && dates.every(Number.isFinite)
        ? "time"
        : "category";
  const values =
    kind === "number"
      ? numeric
      : kind === "time"
        ? dates
        : labels.map((_, index) => index);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  // Halving avoids overflow when finite numeric endpoints span ±Number.MAX_VALUE.
  const span = maximum - minimum;
  const positions = new Map(
    labels.map((label, index) => [
      label,
      maximum === minimum
        ? 0.5
        : Number.isFinite(span)
          ? (values[index]! - minimum) / span
          : (values[index]! / 2 - minimum / 2) / (maximum / 2 - minimum / 2),
    ]),
  );
  const position = (label: string) => positions.get(label) ?? 0.5;
  const ordered = [...labels].sort((a, b) => position(a) - position(b));
  // Keep interior labels away from endpoints, even with clustered samples.
  const middle = ordered
    .filter((label) => position(label) >= 0.3 && position(label) <= 0.7)
    .sort(
      (a, b) => Math.abs(position(a) - 0.5) - Math.abs(position(b) - 0.5),
    )[0];
  const tickLabels = ordered.length
    ? [
        ...new Set([
          ordered[0]!,
          ...(middle ? [middle] : []),
          ordered[ordered.length - 1]!,
        ]),
      ]
    : [];
  const ticks = tickLabels
    .filter(
      (label, index, all) =>
        all.findIndex((other) => position(other) === position(label)) === index,
    )
    .map((label) => ({
      label:
        kind === "time" && label.includes("T")
          ? new Date(isoTime(label))
              .toISOString()
              .replace("T", " ")
              .slice(0, 16)
          : label,
      position: position(label),
    }));
  return { kind, position, ticks };
}

import { useEffect, useMemo, useState } from "react";
import type {
  PublicationAsset,
  PublicationChapter,
} from "@earth-stories/story-schema";

interface Props {
  chapter: Extract<PublicationChapter, { type: "chart" }>;
  asset: PublicationAsset;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0]?.split(",").map((item) => item.trim()) ?? [];
  return lines
    .slice(1)
    .map((line) =>
      Object.fromEntries(
        line.split(",").map((value, index) => [headers[index], value.trim()]),
      ),
    );
}

export function ChartChapter({ chapter, asset }: Props) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(asset.href, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.text();
      })
      .then((text) => setRows(parseCsv(text)))
      .catch((cause) => {
        if (cause instanceof Error && cause.name !== "AbortError")
          setError(true);
      });
    return () => controller.abort();
  }, [asset.href]);
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
  const series = useMemo(
    () =>
      columns.map((column) => ({
        column,
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
          .slice(0, 80),
      })),
    [
      chapter.xColumn,
      chapter.xMax,
      chapter.xMin,
      chapter.yScale,
      columns.join("|"),
      rows,
    ],
  );
  const points = series[0]?.points ?? [];
  const scaleValue = (value: number) =>
    chapter.yScale === "log" ? Math.log10(value) : value;
  const scaledValues = series.flatMap((item) =>
    item.points.map((point) => scaleValue(point.value)),
  );
  const minimum = Math.min(...scaledValues, 0);
  const maximum = Math.max(...scaledValues, 1);
  const scaledRange = maximum - minimum || 1;
  const normalized = (value: number) =>
    (scaleValue(value) - minimum) / scaledRange;
  if (error)
    return <p className="story-media-error">Chart data could not be loaded.</p>;
  if (chapter.chartType === "line") {
    return (
      <figure className="story-chart" aria-label={`${chapter.title} chart`}>
        <svg className="story-chart__line" viewBox="0 0 100 100" role="img">
          {series.map((item, seriesIndex) => (
            <polyline
              key={item.column}
              points={item.points
                .map(
                  (point, index) =>
                    `${item.points.length === 1 ? 50 : (index / (item.points.length - 1)) * 100},${96 - normalized(point.value) * 88}`,
                )
                .join(" ")}
              fill="none"
              vectorEffect="non-scaling-stroke"
              style={{
                stroke: ["#cf3f02", "#126e75", "#7054a0", "#d59d12"][
                  seriesIndex % 4
                ],
              }}
            />
          ))}
          {points.map((point, index) => {
            const x =
              points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
            const y = 96 - normalized(point.value) * 88;
            return (
              <circle
                key={`${point.label}-${point.value}`}
                cx={x}
                cy={y}
                r="1.5"
              >
                <title>
                  {point.label}: {point.value}
                </title>
              </circle>
            );
          })}
        </svg>
        <figcaption>
          {asset.label} · {chapter.xLabel || chapter.xColumn} by{" "}
          {chapter.yLabel || columns.join(", ")}
        </figcaption>
      </figure>
    );
  }
  return (
    <figure className="story-chart" aria-label={`${chapter.title} chart`}>
      <div className="story-chart__plot">
        {points.map((point) => (
          <div
            className="story-chart__item"
            key={`${point.label}-${point.value}`}
          >
            <div
              className="story-chart__bar"
              style={{
                height: `${Math.max(2, normalized(point.value) * 100)}%`,
              }}
            >
              <span>{point.value}</span>
            </div>
            <small>{point.label}</small>
          </div>
        ))}
      </div>
      <figcaption>{asset.label}</figcaption>
    </figure>
  );
}

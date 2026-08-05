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
  const series = useMemo(
    () =>
      columns.map((column) => ({
        column,
        points: rows
          .filter(
            (row) =>
              chapter.xMin === null ||
              chapter.xMin === undefined ||
              (row[chapter.xColumn] ?? "") >= String(chapter.xMin),
          )
          .filter(
            (row) =>
              chapter.xMax === null ||
              chapter.xMax === undefined ||
              (row[chapter.xColumn] ?? "") <= String(chapter.xMax),
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
  const maximum = Math.max(
    ...series.flatMap((item) =>
      item.points.map((point) => scaleValue(point.value)),
    ),
    1,
  );
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
                    `${item.points.length === 1 ? 50 : (index / (item.points.length - 1)) * 100},${96 - (scaleValue(point.value) / maximum) * 88}`,
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
            const y = 96 - (scaleValue(point.value) / maximum) * 88;
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
                height: `${Math.max(2, (point.value / maximum) * 100)}%`,
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

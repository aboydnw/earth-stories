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
  const points = useMemo(
    () =>
      rows
        .map((row) => ({
          label: row[chapter.xColumn] ?? "",
          value: Number(row[chapter.yColumn]),
        }))
        .filter((point) => Number.isFinite(point.value))
        .slice(0, 40),
    [chapter.xColumn, chapter.yColumn, rows],
  );
  const maximum = Math.max(...points.map((point) => point.value), 1);
  if (error)
    return <p className="story-media-error">Chart data could not be loaded.</p>;
  if (chapter.chartType === "line") {
    const coordinates = points
      .map(
        (point, index) =>
          `${points.length === 1 ? 50 : (index / (points.length - 1)) * 100},${96 - (point.value / maximum) * 88}`,
      )
      .join(" ");
    return (
      <figure className="story-chart" aria-label={`${chapter.title} chart`}>
        <svg className="story-chart__line" viewBox="0 0 100 100" role="img">
          <polyline
            points={coordinates}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
          {points.map((point, index) => {
            const x =
              points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
            const y = 96 - (point.value / maximum) * 88;
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
          {asset.label} · {chapter.xColumn} by {chapter.yColumn}
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

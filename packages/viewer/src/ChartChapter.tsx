import { useEffect, useState } from "react";
import type {
  PublicationAsset,
  PublicationChapter,
} from "@earth-stories/story-schema";
import { loadChartSeries } from "./chartData.js";
import type { ChartSeriesData } from "./chartSeries.js";

interface Props {
  chapter: Extract<PublicationChapter, { type: "chart" }>;
  asset: PublicationAsset;
}

const SERIES_COLORS = ["#cf3f02", "#126e75", "#7054a0", "#d59d12"];

export function ChartChapter({ chapter, asset }: Props) {
  const [series, setSeries] = useState<ChartSeriesData[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setSeries([]);
    setError(null);
    loadChartSeries(chapter, asset, controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) setSeries(loaded);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Chart data could not be loaded.",
        );
      });
    return () => controller.abort();
  }, [asset, chapter]);
  const points = series[0]?.points ?? [];
  const scaleValue = (value: number) =>
    chapter.yScale === "log" && value > 0 ? Math.log10(value) : value;
  const scaledValues = series.flatMap((item) =>
    item.points.map((point) => scaleValue(point.value)),
  );
  const minimum = Math.min(...scaledValues, 0);
  const maximum = Math.max(...scaledValues, 1);
  const scaledRange = maximum - minimum || 1;
  const normalized = (value: number) =>
    (scaleValue(value) - minimum) / scaledRange;
  const caption =
    chapter.series.kind === "histogram"
      ? `${asset.label} · value distribution`
      : chapter.series.kind === "timeseries"
        ? `${asset.label} · ${chapter.series.point
            .map((value) => value.toFixed(3))
            .join(", ")}`
        : `${asset.label} · ${chapter.xLabel || chapter.xColumn} by ${
            chapter.yLabel ||
            series.map((item) => item.name).join(", ") ||
            chapter.yColumn
          }`;
  if (error) return <p className="story-media-error">{error}</p>;
  if (chapter.chartType === "line") {
    return (
      <figure className="story-chart" aria-label={`${chapter.title} chart`}>
        <svg className="story-chart__line" viewBox="0 0 100 100" role="img">
          {series.map((item, seriesIndex) => (
            <polyline
              key={item.name}
              points={item.points
                .map(
                  (point, index) =>
                    `${
                      item.points.length === 1
                        ? 50
                        : (index / (item.points.length - 1)) * 100
                    },${96 - normalized(point.value) * 88}`,
                )
                .join(" ")}
              fill="none"
              vectorEffect="non-scaling-stroke"
              style={{
                stroke: SERIES_COLORS[seriesIndex % SERIES_COLORS.length],
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
        <figcaption>{caption}</figcaption>
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
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

import { useEffect, useState } from "react";
import type {
  PublicationAsset,
  PublicationChapter,
} from "@earth-stories/story-schema";
import { loadChartSeries } from "./chartData.js";
import { chartXDomain, type ChartSeriesData } from "./chartSeries.js";

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
  const seriesColor = (index: number) =>
    index === 0
      ? asset.presentation.color
      : SERIES_COLORS[index % SERIES_COLORS.length];
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
    const domain = chartXDomain(series);
    const x = (label: string) => 56 + domain.position(label) * 568;
    const y = (value: number) => 220 - normalized(value) * 184;
    const xLabel = chapter.xLabel || chapter.xColumn;
    const yLabel =
      chapter.yLabel ||
      series.map((item) => item.name).join(", ") ||
      chapter.yColumn;
    return (
      <figure className="story-chart" aria-label={`${chapter.title} chart`}>
        <p className="story-chart__axis-label">
          {yLabel}
          {chapter.yScale === "log" ? " · logarithmic scale" : ""}
        </p>
        <svg
          className="story-chart__line"
          viewBox="0 0 640 280"
          role="img"
          aria-label={`${chapter.title}: ${yLabel} by ${xLabel}. Exact values are available in the data table below.`}
        >
          <title>{chapter.title}</title>
          {[0, 0.5, 1].map((fraction) => {
            const scaled = minimum + fraction * scaledRange;
            const value = chapter.yScale === "log" ? 10 ** scaled : scaled;
            const tickY = 220 - fraction * 184;
            return (
              <g key={fraction}>
                <line
                  x1="56"
                  x2="624"
                  y1={tickY}
                  y2={tickY}
                  stroke="currentColor"
                  strokeOpacity="0.15"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x="46"
                  y={tickY + 4}
                  textAnchor="end"
                  fill="currentColor"
                  fontSize="12"
                >
                  {Number(value.toPrecision(3)).toLocaleString("en-US")}
                </text>
              </g>
            );
          })}
          {series.map((item, seriesIndex) => {
            const color = seriesColor(seriesIndex);
            const ordered = [...item.points].sort(
              (a, b) => domain.position(a.label) - domain.position(b.label),
            );
            return (
              <g key={item.name}>
                <polyline
                  points={ordered
                    .map((point) => `${x(point.label)},${y(point.value)}`)
                    .join(" ")}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                  style={{ stroke: color }}
                />
                {ordered.map((point, index) => (
                  <circle
                    key={`${point.label}-${index}`}
                    cx={x(point.label)}
                    cy={y(point.value)}
                    r="2.7"
                    vectorEffect="non-scaling-stroke"
                    style={{ stroke: color }}
                  >
                    <title>
                      {item.name} · {point.label}: {point.value}
                    </title>
                  </circle>
                ))}
              </g>
            );
          })}
          {domain.ticks.map((tick, index) => (
            <text
              key={`${tick.label}-${index}`}
              x={56 + tick.position * 568}
              y="244"
              textAnchor={
                tick.position === 0
                  ? "start"
                  : tick.position === 1
                    ? "end"
                    : "middle"
              }
              fill="currentColor"
              fontSize="12"
            >
              {tick.label}
            </text>
          ))}
          <text
            x="340"
            y="272"
            textAnchor="middle"
            fill="currentColor"
            fontSize="12"
          >
            {xLabel}
            {domain.kind === "time" && !/\bUTC\b/i.test(xLabel) ? " · UTC" : ""}
          </text>
        </svg>
        {series.length > 1 && (
          <ul className="story-chart__legend">
            {series.map((item, index) => (
              <li key={item.name}>
                <span aria-hidden="true" style={{ color: seriesColor(index) }}>
                  ●{" "}
                </span>
                {item.name}
              </li>
            ))}
          </ul>
        )}
        {!series.some((item) => item.points.length) && (
          <p role="status">No chart samples available.</p>
        )}
        <figcaption>{caption}</figcaption>
        <details className="story-chart__data">
          <summary>View chart data</summary>
          <div
            className="story-chart__table-scroll"
            style={{ overflowX: "auto" }}
          >
            <table>
              <caption>{chapter.title} · exact sample values</caption>
              <thead>
                <tr>
                  <th scope="col">Series</th>
                  <th scope="col">{xLabel}</th>
                  <th scope="col">{yLabel}</th>
                </tr>
              </thead>
              <tbody>
                {series.flatMap((item) =>
                  item.points.map((point, index) => (
                    <tr key={`${item.name}-${index}`}>
                      <th scope="row">{item.name}</th>
                      <td>{point.label}</td>
                      <td>{point.value}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </details>
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

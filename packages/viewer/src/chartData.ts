import { GeoTIFF } from "@developmentseed/geotiff";
import proj4 from "proj4";
import * as zarr from "zarrita";
import {
  parseCsv,
  type PublicationAsset,
  type PublicationChapter,
} from "@earth-stories/story-schema";
import { selectSampleTiles } from "./cogPipeline.js";
import { completeZarrSelection, openZarrVariable } from "./zarrNode.js";
import {
  histogramPoints,
  tablePoints,
  timeseriesPoints,
  type ChartSeriesData,
} from "./chartSeries.js";

type ChartChapter = Extract<PublicationChapter, { type: "chart" }>;

const HISTOGRAM_SAMPLE_TILES = 8;

/** Read CSV text as records keyed by the header row. */
function csvRecords(text: string): Record<string, string>[] {
  const [headerRow, ...rows] = parseCsv(text);
  if (!headerRow) return [];
  const headers = headerRow.map((item) => item.trim());
  return rows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header, (row[index] ?? "").trim()]),
      ),
    );
}

/**
 * Read a spread of pixels from the raster's coarsest overview. The sample is
 * deliberately small: a chart chapter describes the shape of the data, not an
 * exact census, and the reader should not pay for a full-resolution scan.
 */
async function sampleCogValues(
  href: string,
  asset: PublicationAsset,
  signal: AbortSignal,
): Promise<number[]> {
  const source = await GeoTIFF.fromUrl(
    new URL(href, window.location.href).toString(),
  );
  const level = source.overviews[source.overviews.length - 1] ?? source;
  const columns = Math.max(1, Math.ceil(level.width / level.tileWidth));
  const rows = Math.max(1, Math.ceil(level.height / level.tileHeight));
  const bandIndex = Math.max(0, asset.presentation.rasterBand - 1);
  const values: number[] = [];
  for (const [column, row] of selectSampleTiles(
    columns,
    rows,
    HISTOGRAM_SAMPLE_TILES,
  )) {
    if (signal.aborted) return values;
    const tile = await level.fetchTile(column, row, { boundless: false });
    const { layout, width, height, mask, nodata } = tile.array;
    const count = Math.max(1, tile.array.count);
    const band = Math.min(bandIndex, count - 1);
    const data =
      layout === "band-separate"
        ? (tile.array.bands[band] ?? tile.array.bands[0])
        : tile.array.data;
    if (!data) continue;
    for (let index = 0; index < width * height; index += 1) {
      const value = Number(
        layout === "band-separate" ? data[index] : data[index * count + band],
      );
      if (mask !== null && mask[index] === 0) continue;
      if (nodata !== null && value === nodata) continue;
      values.push(value);
    }
  }
  return values;
}

/** Invert the GeoZarr affine transform to find the pixel under a lon/lat. */
export function pixelForPoint(
  transform: readonly number[],
  point: readonly [number, number],
): [number, number] {
  const [a, b, c, d, e, f] = transform as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const determinant = a * e - b * d;
  const [x, y] = point;
  // Math.floor keeps the sign of zero, and a -0 index reads badly downstream.
  const index = (value: number) => (Object.is(value, -0) ? 0 : value);
  const column = index(Math.floor(((x - c) * e - (y - f) * b) / determinant));
  const row = index(Math.floor(((y - f) * a - (x - c) * d) / determinant));
  return [row, column];
}

async function readZarrPointSeries(
  href: string,
  asset: PublicationAsset,
  point: [number, number],
  signal: AbortSignal,
): Promise<ChartSeriesData[]> {
  if (!asset.zarr) throw new Error("Timeseries charts need a Zarr source.");
  const geozarr = asset.zarr.geozarr;
  if (!geozarr)
    throw new Error("This Zarr source has no spatial transform to sample.");
  const opened = await openZarrVariable(href, asset.zarr.variable);
  if (opened.node.kind !== "array")
    throw new Error("The Zarr variable could not be opened.");
  const projected =
    geozarr.crs && geozarr.crs !== "EPSG:4326"
      ? (proj4("EPSG:4326", geozarr.crs, [point[0], point[1]]) as [
          number,
          number,
        ])
      : point;
  const [row, column] = pixelForPoint(geozarr.transform, projected);
  const [height, width] = geozarr.shape;
  if (row < 0 || column < 0 || row >= height || column >= width)
    throw new Error("That point falls outside this dataset.");
  const [yDimension, xDimension] = geozarr.dimensions;
  const dimensions = opened.dimensions ?? [];
  const labels: string[] = [];
  const values: number[] = [];
  for (const step of asset.zarr.timesteps) {
    if (signal.aborted) break;
    const selection = completeZarrSelection(
      { ...asset.zarr.selection, [yDimension]: row, [xDimension]: column },
      dimensions,
      [yDimension, xDimension],
      asset.zarr.timeDimension,
      step.index,
    );
    const scalar = (await zarr.get(
      opened.node,
      dimensions.map((dimension) => selection[dimension] ?? 0),
    )) as number | bigint;
    const value = Number(scalar);
    labels.push(step.label);
    values.push(value === opened.fillValue ? Number.NaN : value);
  }
  return timeseriesPoints(labels, values);
}

/** Resolve a chart chapter's series from its asset, per the configured kind. */
export async function loadChartSeries(
  chapter: ChartChapter,
  asset: PublicationAsset,
  signal: AbortSignal,
): Promise<ChartSeriesData[]> {
  if (chapter.series.kind === "histogram")
    return histogramPoints(
      await sampleCogValues(asset.href, asset, signal),
      chapter.series.bins,
    );
  if (chapter.series.kind === "timeseries")
    return readZarrPointSeries(asset.href, asset, chapter.series.point, signal);
  const response = await fetch(asset.href, { signal });
  if (!response.ok) throw new Error("Chart data could not be loaded.");
  return tablePoints(csvRecords(await response.text()), chapter);
}

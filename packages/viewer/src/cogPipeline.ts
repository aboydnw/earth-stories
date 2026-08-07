import { SampleFormat } from "@cogeotiff/core";
import type { GeoTIFF, Overview } from "@developmentseed/geotiff";

const MAX_RESCALE_SAMPLE_TILES = 4;

export function selectSampleTiles(
  columns: number,
  rows: number,
  limit = MAX_RESCALE_SAMPLE_TILES,
): Array<[number, number]> {
  const total = Math.max(1, columns * rows);
  const count = Math.min(Math.max(1, limit), total);
  return Array.from({ length: count }, (_, sample) => {
    const index =
      count === 1 ? 0 : Math.round((sample * (total - 1)) / (count - 1));
    return [index % columns, Math.floor(index / columns)];
  });
}

/**
 * Report whether the library's inferred render pipeline can display this
 * raster. Inference only understands unsigned-integer rasters that read as
 * imagery with one to four channels of consistent 8- or 16-bit samples.
 * Anything else — float, signed, packed-bit, or wider integer data — needs the
 * explicit rescale-and-colormap pipeline or COGLayer throws before the first
 * tile renders.
 */
export function supportsInferredPipeline(geotiff: GeoTIFF): boolean {
  const tags = geotiff.cachedTags;
  const sampleFormats = tags.sampleFormat;
  const bits = tags.bitsPerSample;
  if (bits.length === 0) return false;
  const firstFormat = sampleFormats?.[0] ?? SampleFormat.Uint;
  const firstBits = bits[0] ?? 8;
  if (
    firstFormat !== SampleFormat.Uint ||
    (sampleFormats?.some((format) => format !== firstFormat) ?? false) ||
    bits.some((value) => value !== firstBits)
  )
    return false;
  if (tags.samplesPerPixel < 1 || tags.samplesPerPixel > 4) return false;
  if (firstBits !== 8 && firstBits !== 16) return false;
  return true;
}

/**
 * Derive a display rescale range for a data raster whose presentation does not
 * define one. GDAL statistics baked into the file win; otherwise the coarsest
 * overview is sampled so the estimate costs at most a few small tile reads.
 */
export async function deriveCogRescale(
  geotiff: GeoTIFF,
  rasterBand: number,
): Promise<[number, number]> {
  const bandIndex = Math.max(0, rasterBand - 1);
  const statistics = geotiff.gdalMetadata?.bandStatistics.get(bandIndex + 1);
  if (
    statistics &&
    statistics.min !== null &&
    statistics.max !== null &&
    Number.isFinite(statistics.min) &&
    Number.isFinite(statistics.max) &&
    statistics.min < statistics.max
  ) {
    return [statistics.min, statistics.max];
  }
  const source: GeoTIFF | Overview =
    geotiff.overviews[geotiff.overviews.length - 1] ?? geotiff;
  const columns = Math.max(1, Math.ceil(source.width / source.tileWidth));
  const rows = Math.max(1, Math.ceil(source.height / source.tileHeight));
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const [column, row] of selectSampleTiles(columns, rows)) {
    const tile = await source.fetchTile(column, row, { boundless: false });
    const { layout, width, height, mask, nodata } = tile.array;
    const bandCount = Math.max(1, tile.array.count);
    const band = Math.min(bandIndex, bandCount - 1);
    const values =
      layout === "band-separate"
        ? (tile.array.bands[band] ?? tile.array.bands[0])
        : tile.array.data;
    if (!values) continue;
    const pixels = width * height;
    for (let index = 0; index < pixels; index += 1) {
      const value = Number(
        layout === "band-separate"
          ? values[index]
          : values[index * bandCount + band],
      );
      if (!Number.isFinite(value)) continue;
      if (mask !== null && mask[index] === 0) continue;
      if (nodata !== null && value === nodata) continue;
      if (value < minimum) minimum = value;
      if (value > maximum) maximum = value;
    }
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return [0, 1];
  if (minimum === maximum) return [minimum, minimum + 1];
  return [minimum, maximum];
}

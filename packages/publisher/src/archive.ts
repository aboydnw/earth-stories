import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type {
  PublicationAsset,
  PublicationManifest,
  StoryProject,
} from "@earth-stories/story-schema";
import { parseCsv } from "./csv.js";
import { containedRealPath } from "./paths.js";

export interface ArchivalOptions {
  project: StoryProject;
  manifest: PublicationManifest;
  projectDirectory: string;
  mapSnapshots?: Record<string, string>;
  exportedAt?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function prose(value: string): string {
  return value
    .split(/\n{2,}/)
    .filter(Boolean)
    .map(
      (paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`,
    )
    .join("");
}
function safeHttp(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function archiveFilters(asset: PublicationAsset): string[] {
  const filters: string[] = [];
  if (
    asset.presentation.filterProperty &&
    asset.presentation.filterValue !== null
  )
    filters.push(
      `${asset.presentation.filterProperty} = ${asset.presentation.filterValue}`,
    );
  if (asset.presentation.symbolProperty)
    filters.push(`Symbols grouped by ${asset.presentation.symbolProperty}`);
  if (asset.kind === "cog") {
    filters.push(`Raster band ${asset.presentation.rasterBand}`);
    if (asset.presentation.rescale)
      filters.push(
        `Display range ${asset.presentation.rescale[0]}–${asset.presentation.rescale[1]}`,
      );
  }
  if (asset.kind === "zarr" && asset.zarr) {
    filters.push(`Variable ${asset.zarr.variable}`);
    for (const [dimension, index] of Object.entries(asset.zarr.selection))
      filters.push(`${dimension} index ${index}`);
  }
  if (asset.kind === "copc" && asset.copc)
    filters.push(`Point colors: ${asset.copc.colorMode}`);
  return filters;
}
function provenanceHtml(
  assets: PublicationAsset[],
  exportedAt: string,
): string {
  const unique = [
    ...new Map(assets.map((asset) => [asset.id, asset])).values(),
  ];
  if (!unique.length) return "";
  return `<details class="provenance" open><summary>Source and provenance</summary>${unique
    .map((asset) => {
      const value = asset.provenance;
      const sourceUrl =
        safeHttp(value.sourceUrl) ??
        (asset.delivery === "connected" ? safeHttp(asset.href) : null);
      const licenseUrl = safeHttp(value.licenseUrl);
      const updated = value.dataUpdatedAt;
      const age = updated
        ? Math.floor(
            (Date.parse(exportedAt) - Date.parse(updated)) / 86_400_000,
          )
        : null;
      const freshness =
        updated &&
        value.staleAfterDays !== null &&
        age !== null &&
        age > value.staleAfterDays
          ? "May be stale"
          : updated && value.staleAfterDays !== null
            ? "Within the supplied freshness window"
            : "Freshness not claimed";
      const filters = archiveFilters(asset);
      return `<section><h3>${escapeHtml(asset.label)}</h3><dl><dt>Publisher</dt><dd>${escapeHtml(value.publisher ?? asset.attribution ?? "Not provided")}</dd>${sourceUrl ? `<dt>Source</dt><dd><a href="${escapeHtml(sourceUrl)}">${escapeHtml(sourceUrl)}</a></dd>` : ""}${value.licenseName || licenseUrl ? `<dt>License</dt><dd>${licenseUrl ? `<a href="${escapeHtml(licenseUrl)}">${escapeHtml(value.licenseName ?? "License details")}</a>` : escapeHtml(value.licenseName ?? "")}</dd>` : ""}${updated ? `<dt>Data updated</dt><dd><time datetime="${escapeHtml(updated)}">${escapeHtml(updated)}</time> · ${freshness}</dd>` : ""}${value.accessedAt ? `<dt>Accessed</dt><dd><time datetime="${escapeHtml(value.accessedAt)}">${escapeHtml(value.accessedAt)}</time></dd>` : ""}${value.temporalCoverage ? `<dt>Temporal coverage</dt><dd>${escapeHtml(value.temporalCoverage.start ?? "Start not provided")} – ${escapeHtml(value.temporalCoverage.end ?? "End not provided")}</dd>` : ""}${value.spatialCoverage ? `<dt>Spatial coverage</dt><dd>${escapeHtml(value.spatialCoverage)}</dd>` : ""}</dl>${value.transformations.length ? `<h4>Transformations</h4><ol>${value.transformations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>` : ""}${filters.length ? `<h4>Active display filters</h4><ul>${filters.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}</section>`;
    })
    .join("")}</details>`;
}
function mime(path: string): string {
  return (
    (
      {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
      } as Record<string, string>
    )[extname(path).toLowerCase()] ?? "application/octet-stream"
  );
}
async function dataUrl(path: string): Promise<string> {
  return `data:${mime(path)};base64,${(await readFile(path)).toString("base64")}`;
}
async function projectAsset(
  projectDirectory: string,
  locator: string,
): Promise<string> {
  return containedRealPath(
    projectDirectory,
    locator,
    "Archival asset escapes the project directory",
  );
}

function chartSvg(
  csv: string,
  xColumn: string,
  yColumns: string[],
  chartType: "bar" | "line",
  title: string,
): string {
  const rows = parseCsv(csv);
  const headers = rows[0]?.map((item) => item.trim()) ?? [];
  const x = headers.indexOf(xColumn);
  const series = yColumns.map((column) => ({
    column,
    values: rows
      .slice(1)
      .map((cells) => ({
        label: cells[x]?.trim() ?? "",
        value: Number(cells[headers.indexOf(column)]),
      }))
      .filter((item) => Number.isFinite(item.value))
      .slice(0, 30),
  }));
  const allValues = series.flatMap((item) =>
    item.values.map((value) => value.value),
  );
  const minimum = Math.min(...allValues, 0);
  const maximum = Math.max(...allValues, 1);
  const valueRange = maximum - minimum || 1;
  const normalized = (value: number) => (value - minimum) / valueRange;
  const width = 900;
  const height = 420;
  const longestSeries = series.reduce(
    (longest, item) =>
      item.values.length > longest.values.length ? item : longest,
    { column: "", values: [] as Array<{ label: string; value: number }> },
  );
  const slot = longestSeries.values.length
    ? 760 / longestSeries.values.length
    : 760;
  const colors = ["#dd4b1a", "#126e75", "#7054a0", "#d59d12"];
  const marks =
    chartType === "line"
      ? series
          .map(
            (item, seriesIndex) =>
              `<polyline fill="none" stroke="${colors[seriesIndex % colors.length]}" stroke-width="4" points="${item.values.map((value, index) => `${90 + index * slot + slot / 2},${350 - normalized(value.value) * 300}`).join(" ")}"><title>${escapeHtml(item.column)}</title></polyline>`,
          )
          .join("")
      : series
          .flatMap((item, seriesIndex) =>
            item.values.map((value, index) => {
              const groupWidth = Math.max(3, slot - 5);
              const barWidth = groupWidth / series.length;
              const height = normalized(value.value) * 300;
              const left = 90 + index * slot + seriesIndex * barWidth;
              return `<rect x="${left}" y="${350 - height}" width="${barWidth}" height="${height}" fill="${colors[seriesIndex % colors.length]}"><title>${escapeHtml(item.column)} — ${escapeHtml(value.label)}: ${value.value}</title></rect>`;
            }),
          )
          .join("");
  const labels = longestSeries.values
    .map(
      (item, index) =>
        `<text x="${90 + index * slot + slot / 2}" y="375" text-anchor="middle" font-size="10">${escapeHtml(item.label.slice(0, 12))}</text>`,
    )
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}"><rect width="100%" height="100%" fill="#f6f1e8"/><line x1="80" y1="350" x2="860" y2="350" stroke="#332b27"/>${marks}${labels}</svg>`;
}

export async function buildArchivalHtml({
  project,
  manifest,
  projectDirectory,
  mapSnapshots = {},
  exportedAt = new Date().toISOString(),
}: ArchivalOptions): Promise<string> {
  const sources = new Map(project.sources.map((source) => [source.id, source]));
  const assets = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const chapterProvenance = (ids: Array<string | null | undefined>) =>
    provenanceHtml(
      ids.flatMap((id) => (id && assets.get(id) ? [assets.get(id)!] : [])),
      exportedAt,
    );
  const chapters: string[] = [];
  for (const chapter of project.chapters) {
    const heading = `<h2>${escapeHtml(chapter.title)}</h2>`;
    const narrative = `<div class="narrative">${prose(chapter.narrative)}</div>`;
    if (chapter.type === "prose") {
      chapters.push(`<section>${heading}${narrative}</section>`);
      continue;
    }
    if (
      chapter.type === "map" ||
      chapter.type === "scrolly" ||
      chapter.type === "flyover"
    ) {
      const snapshot = mapSnapshots[chapter.id];
      const validSnapshot =
        snapshot &&
        /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(
          snapshot,
        );
      const flyoverCaptions =
        chapter.type === "flyover"
          ? chapter.keyframes
              .map(({ caption }) => caption.trim())
              .filter(Boolean)
          : [];
      chapters.push(
        `<section>${heading}${validSnapshot ? `<img src="${escapeHtml(snapshot)}" alt="Map snapshot for ${escapeHtml(chapter.title)}">` : `<div class="unavailable">Map snapshot unavailable.${chapter.type === "flyover" ? ` Flyover contains ${chapter.keyframes.length} camera keyframes.` : ` Camera: ${chapter.camera.center.join(", ")} at zoom ${chapter.camera.zoom}.`}</div>`}${flyoverCaptions.length ? `<ol class="flyover-captions">${flyoverCaptions.map((caption) => `<li>${escapeHtml(caption)}</li>`).join("")}</ol>` : ""}${chapterProvenance([chapter.sourceId, ...(chapter.overlaySourceIds ?? [])])}${narrative}</section>`,
      );
      continue;
    }
    if (chapter.type === "video") {
      chapters.push(
        `<section>${heading}<div class="unavailable">Embedded video is preserved as a reference in this archival edition. <a href="${escapeHtml(chapter.originalUrl)}">Open original video</a>.</div>${narrative}</section>`,
      );
      continue;
    }
    const source = sources.get(chapter.sourceId);
    if (chapter.type === "image" && source?.kind === "image") {
      const src = await dataUrl(
        await projectAsset(projectDirectory, source.path),
      );
      chapters.push(
        `<section>${heading}<figure><img src="${src}" alt="${escapeHtml(chapter.alt)}"><figcaption>${escapeHtml(chapter.caption || source.label)}</figcaption></figure>${chapterProvenance([chapter.sourceId])}${narrative}</section>`,
      );
      continue;
    }
    if (chapter.type === "chart" && source?.kind === "csv") {
      const svg = chartSvg(
        await readFile(
          await projectAsset(projectDirectory, source.path),
          "utf8",
        ),
        chapter.xColumn,
        [chapter.yColumn, ...(chapter.yColumns ?? [])],
        chapter.chartType,
        chapter.title,
      );
      chapters.push(
        `<section>${heading}<figure>${svg}<figcaption>${escapeHtml(source.label)}</figcaption></figure>${chapterProvenance([chapter.sourceId])}${narrative}</section>`,
      );
      continue;
    }
  }
  const safeConnectedAssets = manifest.assets.filter((asset) => {
    if (asset.delivery !== "connected") return false;
    try {
      const url = new URL(asset.href);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  });
  const safeConnectedIds = new Set(safeConnectedAssets.map(({ id }) => id));
  const sourceTags = safeConnectedAssets
    .map(
      (asset) => `<meta name="dc.source" content="${escapeHtml(asset.href)}">`,
    )
    .join("\n");
  const citations = manifest.assets
    .map(
      (asset) =>
        `<li><strong>${escapeHtml(asset.label)}</strong>${asset.attribution ? ` — ${escapeHtml(asset.attribution)}` : ""}${safeConnectedIds.has(asset.id) ? ` — <a href="${escapeHtml(asset.href)}">source</a>` : ""}</li>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(project.metadata.title)}</title><meta name="dc.title" content="${escapeHtml(project.metadata.title)}">${project.metadata.author ? `<meta name="dc.creator" content="${escapeHtml(project.metadata.author)}">` : ""}<meta name="dc.date" content="${escapeHtml(exportedAt)}"><meta name="dc.description" content="${escapeHtml(project.metadata.description)}">${sourceTags}<style>${archiveCss}</style></head><body><article><header><p class="kicker">Earth Stories archival edition</p><h1>${escapeHtml(project.metadata.title)}</h1><p class="description">${escapeHtml(project.metadata.description)}</p>${project.metadata.author ? `<p>By ${escapeHtml(project.metadata.author)}</p>` : ""}</header>${chapters.join("\n")}<section class="citations"><h2>Sources and attribution</h2><ul>${citations || "<li>None recorded.</li>"}</ul></section></article><footer>Exported ${escapeHtml(exportedAt)} · Project ${escapeHtml(project.id)} · Build ${escapeHtml(manifest.build.id)} · Earth Stories</footer></body></html>`;
}

const archiveCss = `:root{color:#2e2925;background:#d8d2c7;font-family:Georgia,serif}*{box-sizing:border-box}body{margin:0}article{max-width:900px;margin:auto;background:#f6f1e8;padding:clamp(24px,7vw,90px)}header{padding-bottom:3rem;border-bottom:1px solid #2e2925}h1{font-size:clamp(3rem,9vw,7rem);line-height:.9;font-weight:400;margin:.2em 0}h2{font-size:2rem;font-weight:400}section{margin:5rem 0}.kicker{font:11px monospace;text-transform:uppercase;color:#dd4b1a;letter-spacing:.14em}.description{font-size:1.3rem;color:#695d54}.narrative{font-size:1.1rem;line-height:1.7;max-width:680px}img,svg{display:block;width:100%;height:auto;border:1px solid #2e2925}figcaption{font:11px monospace;margin-top:.6rem}.unavailable{padding:3rem;border:1px dashed #dd4b1a;background:#fffaf1}.provenance{margin:1rem 0 2rem;padding:1rem;border-top:1px solid #695d54;font:12px/1.5 monospace}.provenance summary{font-weight:bold}.provenance section{margin:1rem 0}.provenance dl{display:grid;grid-template-columns:max-content 1fr;gap:.35rem 1rem}.provenance dd{margin:0;overflow-wrap:anywhere}.provenance h4{margin-bottom:.3rem}.citations{border-top:1px solid #2e2925;padding-top:2rem}.citations li{margin:.7rem 0}a{color:#a92c08}footer{max-width:900px;margin:auto;padding:2rem;font:10px monospace;color:#695d54}`;

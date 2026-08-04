import { readFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import type {
  PublicationManifest,
  StoryProject,
} from "@earth-stories/story-schema";

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
function projectAsset(projectDirectory: string, locator: string): string {
  const root = resolve(projectDirectory);
  const candidate = resolve(root, locator);
  const relation = relative(root, candidate);
  if (relation === ".." || relation.startsWith(`..${sep}`))
    throw new Error("Archival asset escapes the project directory");
  return candidate;
}

function chartSvg(
  csv: string,
  xColumn: string,
  yColumn: string,
  title: string,
): string {
  const lines = csv.trim().split(/\r?\n/);
  const headers = lines[0]?.split(",").map((item) => item.trim()) ?? [];
  const x = headers.indexOf(xColumn);
  const y = headers.indexOf(yColumn);
  const values = lines
    .slice(1)
    .map((line) => {
      const cells = line.split(",");
      return { label: cells[x]?.trim() ?? "", value: Number(cells[y]) };
    })
    .filter((item) => Number.isFinite(item.value))
    .slice(0, 30);
  const maximum = Math.max(...values.map((item) => item.value), 1);
  const width = 900;
  const height = 420;
  const slot = values.length ? 760 / values.length : 760;
  const bars = values
    .map((item, index) => {
      const barHeight = (item.value / maximum) * 300;
      const left = 90 + index * slot;
      return `<rect x="${left}" y="${350 - barHeight}" width="${Math.max(3, slot - 5)}" height="${barHeight}" fill="#dd4b1a"><title>${escapeHtml(item.label)}: ${item.value}</title></rect><text x="${left + slot / 2}" y="375" text-anchor="middle" font-size="10">${escapeHtml(item.label.slice(0, 12))}</text>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}"><rect width="100%" height="100%" fill="#f6f1e8"/><line x1="80" y1="350" x2="860" y2="350" stroke="#332b27"/>${bars}</svg>`;
}

export async function buildArchivalHtml({
  project,
  manifest,
  projectDirectory,
  mapSnapshots = {},
  exportedAt = new Date().toISOString(),
}: ArchivalOptions): Promise<string> {
  const sources = new Map(project.sources.map((source) => [source.id, source]));
  const chapters: string[] = [];
  for (const chapter of project.chapters) {
    const heading = `<h2>${escapeHtml(chapter.title)}</h2>`;
    const narrative = `<div class="narrative">${prose(chapter.narrative)}</div>`;
    if (chapter.type === "prose") {
      chapters.push(`<section>${heading}${narrative}</section>`);
      continue;
    }
    if (chapter.type === "map" || chapter.type === "scrolly") {
      const snapshot = mapSnapshots[chapter.id];
      chapters.push(
        `<section>${heading}${snapshot?.startsWith("data:image/") ? `<img src="${snapshot}" alt="Map snapshot for ${escapeHtml(chapter.title)}">` : `<div class="unavailable">Map snapshot unavailable. Camera: ${chapter.camera.center.join(", ")} at zoom ${chapter.camera.zoom}.</div>`}${narrative}</section>`,
      );
      continue;
    }
    const source = sources.get(chapter.sourceId);
    if (chapter.type === "image" && source?.kind === "image") {
      const src = await dataUrl(projectAsset(projectDirectory, source.path));
      chapters.push(
        `<section>${heading}<figure><img src="${src}" alt="${escapeHtml(chapter.alt)}"><figcaption>${escapeHtml(chapter.caption || source.label)}</figcaption></figure>${narrative}</section>`,
      );
      continue;
    }
    if (chapter.type === "chart" && source?.kind === "csv") {
      const svg = chartSvg(
        await readFile(projectAsset(projectDirectory, source.path), "utf8"),
        chapter.xColumn,
        chapter.yColumn,
        chapter.title,
      );
      chapters.push(
        `<section>${heading}<figure>${svg}<figcaption>${escapeHtml(source.label)}</figcaption></figure>${narrative}</section>`,
      );
      continue;
    }
  }
  const sourceTags = manifest.assets
    .filter((asset) => asset.delivery === "connected")
    .map(
      (asset) => `<meta name="dc.source" content="${escapeHtml(asset.href)}">`,
    )
    .join("\n");
  const citations = manifest.assets
    .map(
      (asset) =>
        `<li><strong>${escapeHtml(asset.label)}</strong>${asset.attribution ? ` — ${escapeHtml(asset.attribution)}` : ""}${asset.delivery === "connected" ? ` — <a href="${escapeHtml(asset.href)}">source</a>` : ""}</li>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(project.metadata.title)}</title><meta name="dc.title" content="${escapeHtml(project.metadata.title)}">${project.metadata.author ? `<meta name="dc.creator" content="${escapeHtml(project.metadata.author)}">` : ""}<meta name="dc.date" content="${escapeHtml(exportedAt)}"><meta name="dc.description" content="${escapeHtml(project.metadata.description)}">${sourceTags}<style>${archiveCss}</style></head><body><article><header><p class="kicker">Earth Stories archival edition</p><h1>${escapeHtml(project.metadata.title)}</h1><p class="description">${escapeHtml(project.metadata.description)}</p>${project.metadata.author ? `<p>By ${escapeHtml(project.metadata.author)}</p>` : ""}</header>${chapters.join("\n")}<section class="citations"><h2>Sources and attribution</h2><ul>${citations || "<li>None recorded.</li>"}</ul></section></article><footer>Exported ${escapeHtml(exportedAt)} · Project ${escapeHtml(project.id)} · Build ${escapeHtml(manifest.build.id)} · Earth Stories</footer></body></html>`;
}

const archiveCss = `:root{color:#2e2925;background:#d8d2c7;font-family:Georgia,serif}*{box-sizing:border-box}body{margin:0}article{max-width:900px;margin:auto;background:#f6f1e8;padding:clamp(24px,7vw,90px)}header{padding-bottom:3rem;border-bottom:1px solid #2e2925}h1{font-size:clamp(3rem,9vw,7rem);line-height:.9;font-weight:400;margin:.2em 0}h2{font-size:2rem;font-weight:400}section{margin:5rem 0}.kicker{font:11px monospace;text-transform:uppercase;color:#dd4b1a;letter-spacing:.14em}.description{font-size:1.3rem;color:#695d54}.narrative{font-size:1.1rem;line-height:1.7;max-width:680px}img,svg{display:block;width:100%;height:auto;border:1px solid #2e2925}figcaption{font:11px monospace;margin-top:.6rem}.unavailable{padding:3rem;border:1px dashed #dd4b1a;background:#fffaf1}.citations{border-top:1px solid #2e2925;padding-top:2rem}.citations li{margin:.7rem 0}a{color:#a92c08}footer{max-width:900px;margin:auto;padding:2rem;font:10px monospace;color:#695d54}`;

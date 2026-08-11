import { waitForMap } from "./captureSnapshots";

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 627;

const TITLE_MAX_LINES = 3;
const TITLE_MARGIN = 64;

export interface CoverRect {
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
}

interface ReadyMapCanvas {
  canvas: HTMLCanvasElement;
  map: HTMLElement;
}

interface ReadableMapLayer {
  canvas: HTMLCanvasElement;
  attribution: string;
}

/**
 * Chooses the source rectangle that fills a card without distorting the
 * capture, cropping the longer axis evenly on both sides.
 */
export function coverRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth = SHARE_CARD_WIDTH,
  targetHeight = SHARE_CARD_HEIGHT,
): CoverRect {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  if (sourceRatio > targetRatio) {
    const sWidth = sourceHeight * targetRatio;
    return {
      sx: (sourceWidth - sWidth) / 2,
      sy: 0,
      sWidth,
      sHeight: sourceHeight,
    };
  }
  const sHeight = sourceWidth / targetRatio;
  return {
    sx: 0,
    sy: (sourceHeight - sHeight) / 2,
    sWidth: sourceWidth,
    sHeight,
  };
}

/**
 * Breaks a title into rendered lines, ellipsizing whatever will not fit so a
 * long title never overflows the card.
 */
export function wrapLines(
  text: string,
  measure: (value: string) => number,
  maxWidth: number,
  maxLines = TITLE_MAX_LINES,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate) > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else line = candidate;
  }
  if (lines.length < maxLines && line) lines.push(line);
  const rendered = lines.slice(0, maxLines);
  const consumed = rendered.join(" ").split(/\s+/).length;
  const clipped = consumed < words.length;
  if (rendered.length) {
    const last = rendered.length - 1;
    const overflows = measure(rendered[last]!) > maxWidth;
    if (clipped || overflows)
      rendered[last] = ellipsize(rendered[last]!, measure, maxWidth);
  }
  return rendered;
}

function ellipsize(
  value: string,
  measure: (value: string) => number,
  maxWidth: number,
): string {
  let truncated = value;
  while (truncated && measure(`${truncated}…`) > maxWidth)
    truncated = truncated.slice(0, -1).trimEnd();
  return `${truncated}…`;
}

function readyMapCanvas(root: ParentNode): ReadyMapCanvas | null {
  for (const map of root.querySelectorAll<HTMLElement>(".story-map")) {
    const canvas = map.querySelector<HTMLCanvasElement>("canvas");
    if (canvas && canvas.width > 0 && canvas.height > 0) return { canvas, map };
  }
  return null;
}

export function mapAttribution(map: ParentNode): string {
  const values = [
    ...map.querySelectorAll<HTMLElement>(
      ".story-map__attribution, .maplibregl-ctrl-attrib",
    ),
  ]
    .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return [...new Set(values)].join(" · ");
}

/**
 * Crops the first ready map into a card-shaped canvas, but only returns it once
 * its pixels are proven readable. A cross-origin tile taints a canvas silently
 * during drawImage and only throws when the finished card is exported, so the
 * taint has to be caught here, while the story card can still fall back to its
 * scrim alone.
 */
function readableMapLayer(root: ParentNode): ReadableMapLayer | null {
  const source = readyMapCanvas(root);
  if (!source) return null;
  const layer = document.createElement("canvas");
  layer.width = SHARE_CARD_WIDTH;
  layer.height = SHARE_CARD_HEIGHT;
  const context = layer.getContext("2d");
  if (!context) return null;
  const { sx, sy, sWidth, sHeight } = coverRect(
    source.canvas.width,
    source.canvas.height,
  );
  try {
    context.drawImage(
      source.canvas,
      sx,
      sy,
      sWidth,
      sHeight,
      0,
      0,
      SHARE_CARD_WIDTH,
      SHARE_CARD_HEIGHT,
    );
    context.getImageData(0, 0, 1, 1);
  } catch {
    return null;
  }
  return { canvas: layer, attribution: mapAttribution(source.map) };
}

/**
 * Renders the link preview image: the first ready map behind a scrim carrying
 * the story title. Stories without a usable map get the scrim alone, so every
 * story still has a card.
 */
export async function captureShareCard(
  title: string,
  root: ParentNode = document,
): Promise<string> {
  const mapElement = root.querySelector<HTMLElement>(".story-map");
  if (mapElement) await waitForMap(mapElement);

  const output = document.createElement("canvas");
  output.width = SHARE_CARD_WIDTH;
  output.height = SHARE_CARD_HEIGHT;
  const context = output.getContext("2d");
  if (!context)
    throw new Error("This browser cannot render a link preview image.");

  context.fillStyle = "#1d2b2a";
  context.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  const mapLayer = readableMapLayer(root);
  if (mapLayer) context.drawImage(mapLayer.canvas, 0, 0);

  const scrim = context.createLinearGradient(
    0,
    SHARE_CARD_HEIGHT * 0.35,
    0,
    SHARE_CARD_HEIGHT,
  );
  scrim.addColorStop(0, "rgba(16,26,25,0)");
  scrim.addColorStop(1, "rgba(16,26,25,.92)");
  context.fillStyle = scrim;
  context.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  if (mapLayer?.attribution) {
    context.font = "500 19px system-ui, sans-serif";
    const maxCreditWidth = SHARE_CARD_WIDTH - TITLE_MARGIN * 2;
    const measureCredit = (value: string) => context.measureText(value).width;
    const credit =
      measureCredit(mapLayer.attribution) > maxCreditWidth
        ? ellipsize(mapLayer.attribution, measureCredit, maxCreditWidth)
        : mapLayer.attribution;
    const creditWidth = context.measureText(credit).width;
    context.fillStyle = "rgba(16,26,25,.92)";
    context.fillRect(TITLE_MARGIN - 12, 28, creditWidth + 24, 38);
    context.fillStyle = "#fdfbf7";
    context.textBaseline = "middle";
    context.fillText(credit, TITLE_MARGIN, 47);
  }

  const heading = title.trim() || "Untitled story";
  context.font = "600 58px Georgia, serif";
  context.fillStyle = "#fdfbf7";
  context.textBaseline = "alphabetic";
  const lines = wrapLines(
    heading,
    (value) => context.measureText(value).width,
    SHARE_CARD_WIDTH - TITLE_MARGIN * 2,
  );
  let baseline = SHARE_CARD_HEIGHT - TITLE_MARGIN - (lines.length - 1) * 70;
  for (const line of lines) {
    context.fillText(line, TITLE_MARGIN, baseline);
    baseline += 70;
  }

  return output.toDataURL("image/png");
}

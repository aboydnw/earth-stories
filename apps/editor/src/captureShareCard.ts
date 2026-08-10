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

function readyMapCanvas(root: ParentNode): HTMLCanvasElement | null {
  for (const canvas of root.querySelectorAll<HTMLCanvasElement>(
    ".story-map canvas",
  ))
    if (canvas.width > 0 && canvas.height > 0) return canvas;
  return null;
}

/**
 * Crops the first ready map into a card-shaped canvas, but only returns it once
 * its pixels are proven readable. A cross-origin tile taints a canvas silently
 * during drawImage and only throws when the finished card is exported, so the
 * taint has to be caught here, while the story card can still fall back to its
 * scrim alone.
 */
function readableMapLayer(root: ParentNode): HTMLCanvasElement | null {
  const source = readyMapCanvas(root);
  if (!source) return null;
  const layer = document.createElement("canvas");
  layer.width = SHARE_CARD_WIDTH;
  layer.height = SHARE_CARD_HEIGHT;
  const context = layer.getContext("2d");
  if (!context) return null;
  const { sx, sy, sWidth, sHeight } = coverRect(source.width, source.height);
  try {
    context.drawImage(
      source,
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
  return layer;
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
  if (mapLayer) context.drawImage(mapLayer, 0, 0);

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

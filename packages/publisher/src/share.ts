import type { StoryProject } from "@earth-stories/story-schema";
import { escapeAttribute } from "./html.js";
import {
  PUBLICATION_URL_PLACEHOLDER,
  normalizePublicationUrl,
} from "./publication-url.js";

export * from "./publication-url.js";
export const SHARE_CARD_PATH = "share/card-1.png";
export const SHARE_POST_TEXT_PATH = "share/post-text.md";
export const SHARE_CARD_SOURCE_FILENAME = "share-card.png";
export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 627;

const SHARE_MARKER_START = "<!--earth-stories:share-->";
const SHARE_MARKER_END = "<!--/earth-stories:share-->";
const DESCRIPTION_LIMIT = 200;

export interface ShareKitOptions {
  project: StoryProject;
  publicationUrl?: string;
}

export interface ShareKit {
  description: string | null;
  metaTags: string;
  postText: string;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const clipped = value.slice(0, limit);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? clipped.slice(0, lastSpace) : clipped).replace(/[.,;:!?—-]+$/, "")}…`;
}

/**
 * Resolves the text social platforms show beneath a shared link: the story
 * description when the author wrote one, otherwise the opening narrative.
 * Returns null when the story offers neither.
 */
export function shareDescription(project: StoryProject): string | null {
  const described = collapseWhitespace(project.metadata.description);
  if (described) return truncate(described, DESCRIPTION_LIMIT);
  for (const chapter of project.chapters) {
    const narrative = collapseWhitespace(chapter.narrative);
    if (narrative) return truncate(narrative, DESCRIPTION_LIMIT);
  }
  return null;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_HEADER_CHUNK_LENGTH = 13;
const SMALLEST_PNG_BYTES = 45;

let crcTable: Uint32Array | null = null;

/**
 * Computes the PNG chunk CRC over a byte range. This is written out rather than
 * taken from node:zlib because the editor bundles this module for the browser.
 */
function crc32(bytes: Uint8Array, start: number, end: number): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1)
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1)
    crc = crcTable[(crc ^ bytes[index]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!,
  );
}

/**
 * Reports whether bytes are a structurally sound PNG rather than arbitrary
 * data wearing a PNG signature, which browsers and social platforms refuse to
 * render as a link preview. Walks every chunk so a declared length reaching
 * past the end of the file, a corrupted chunk, or data trailing the terminating
 * chunk is rejected rather than published as the story's og:image.
 */
export function isValidPng(bytes: Uint8Array): boolean {
  if (bytes.byteLength < SMALLEST_PNG_BYTES) return false;
  if (PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) return false;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = PNG_SIGNATURE.length;
  let expectHeader = true;

  while (offset + 12 <= bytes.byteLength) {
    const length = view.getUint32(offset);
    const crcStart = offset + 8 + length;
    if (length > 0x7fffffff || crcStart + 4 > bytes.byteLength) return false;

    const type = chunkType(bytes, offset + 4);
    if (expectHeader && (type !== "IHDR" || length !== PNG_HEADER_CHUNK_LENGTH))
      return false;
    if (view.getUint32(crcStart) !== crc32(bytes, offset + 4, crcStart))
      return false;

    expectHeader = false;
    offset = crcStart + 4;
    if (type === "IEND") return length === 0 && offset === bytes.byteLength;
  }
  return false;
}

/**
 * Builds the social metadata and pre-written post text for a release. The
 * publication URL is unknown until the author deploys, so it defaults to a
 * placeholder that a later export rewrites once they paste the real one.
 */
export function buildShareKit({
  project,
  publicationUrl = PUBLICATION_URL_PLACEHOLDER,
}: ShareKitOptions): ShareKit {
  const base = normalizePublicationUrl(publicationUrl);
  const title = project.metadata.title.trim();
  const description = shareDescription(project);
  const cardUrl = `${base}/${SHARE_CARD_PATH}`;
  const author = project.metadata.author?.trim();

  const tags = [
    ['property="og:type"', "website"],
    ['property="og:title"', title],
    ...(description ? [['property="og:description"', description]] : []),
    ['property="og:url"', `${base}/`],
    ['property="og:image"', cardUrl],
    ['property="og:image:width"', String(SHARE_CARD_WIDTH)],
    ['property="og:image:height"', String(SHARE_CARD_HEIGHT)],
    ['name="twitter:card"', "summary_large_image"],
    ['name="twitter:title"', title],
    ...(description ? [['name="twitter:description"', description]] : []),
    ['name="twitter:image"', cardUrl],
    ...(author ? [['name="author"', author]] : []),
  ] as const;

  const metaTags = [
    SHARE_MARKER_START,
    ...tags.map(
      ([attribute, content]) =>
        `<meta ${attribute} content="${escapeAttribute(content)}">`,
    ),
    SHARE_MARKER_END,
  ].join("");

  const byline = author ? ` by ${author}` : "";
  const postText = `# Share this story

Copy one of these, then paste it with your published link.

## Short

${title}${byline}

${base}/

## With context

${description ? `${description}\n\n` : ""}${title} is an interactive story you can scroll through in your browser.

${base}/

## Notes

- The link preview image is ${SHARE_CARD_PATH}, referenced as ${cardUrl}.
- Re-export after deploying so this file and the page metadata carry your real URL instead of ${PUBLICATION_URL_PLACEHOLDER}.
`;

  return { description, metaTags, postText };
}

/**
 * Inserts the share metadata into compiled HTML, replacing an earlier block
 * when one is already present so repeated exports stay idempotent.
 */
export function injectShareMeta(html: string, metaTags: string): string {
  const existing = new RegExp(
    `${SHARE_MARKER_START}[\\s\\S]*?${SHARE_MARKER_END}`,
  );
  if (existing.test(html)) return html.replace(existing, () => metaTags);
  const headClose = html.search(/<\/head\s*>/i);
  if (headClose !== -1)
    return `${html.slice(0, headClose)}${metaTags}${html.slice(headClose)}`;
  const doctype = html.match(/^\s*<!doctype[^>]*>/i)?.[0];
  return doctype
    ? `${doctype}${metaTags}${html.slice(doctype.length)}`
    : `${metaTags}${html}`;
}

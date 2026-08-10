import { authorizedFetch, isValidPng } from "@earth-stories/publisher";

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_CARD_BYTES = 5 * 1024 * 1024;
const CARD_ASPECT = 1200 / 627;
const ASPECT_TOLERANCE = 0.15;
const REQUEST_TIMEOUT_MS = 15_000;

export interface ShareLinkProblem {
  id: string;
  severity: "error" | "warning";
  message: string;
  resolution?: string;
}

export interface ShareLinkReport {
  url: string;
  reachable: boolean;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  imageBytes: number | null;
  problems: ShareLinkProblem[];
}

/**
 * Decodes a PNG data URL produced by the editor's card capture, rejecting
 * anything that is not genuinely a PNG small enough for social platforms.
 * Oversized payloads are refused before they are decoded into memory.
 */
export function decodeShareCard(value: unknown): Buffer {
  if (typeof value !== "string")
    throw new Error("Send the share card as a PNG data URL");
  const encoded = value.match(
    /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/,
  )?.[1];
  if (!encoded) throw new Error("Send the share card as a PNG data URL");
  if (encoded.length > Math.ceil((MAX_CARD_BYTES * 4) / 3))
    throw new Error("The share card is larger than 5 MB");
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.byteLength > MAX_CARD_BYTES)
    throw new Error("The share card is larger than 5 MB");
  if (!isValidPng(buffer)) throw new Error("The share card is not a PNG image");
  return buffer;
}

function metaContent(html: string, key: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]*(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`,
    "i",
  );
  const tag = html.match(pattern)?.[0];
  const content = tag?.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
  return content?.trim() ? decodeEntities(content.trim()) : null;
}

function decodeEntities(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

async function readCapped(
  response: Response,
  limit: number,
): Promise<{ text: string; bytes: number }> {
  const reader = response.body?.getReader();
  if (!reader) return { text: "", bytes: 0 };
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > limit) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString("utf8"), bytes };
}

/**
 * Fetches a deployed story and reports how its link will unfurl on social
 * platforms, which read static metadata and never execute the page's scripts.
 */
export async function checkShareLink(url: string): Promise<ShareLinkReport> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    throw new Error("Publication URL must use HTTP or HTTPS");

  const problems: ShareLinkProblem[] = [];
  const report: ShareLinkReport = {
    url: parsed.toString(),
    reachable: false,
    title: null,
    description: null,
    imageUrl: null,
    imageBytes: null,
    problems,
  };

  let html = "";
  try {
    const response = await authorizedFetch(parsed.toString(), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      problems.push({
        id: "page-unreachable",
        severity: "error",
        message: `The published page returned ${response.status}.`,
        resolution: "Deploy the release folder, then check the URL again.",
      });
      return report;
    }
    report.reachable = true;
    html = (await readCapped(response, MAX_HTML_BYTES)).text;
  } catch (cause) {
    problems.push({
      id: "page-unreachable",
      severity: "error",
      message: "Earth Stories could not reach the published page.",
      resolution:
        cause instanceof Error ? cause.message : "Check the URL and try again.",
    });
    return report;
  }

  report.title = metaContent(html, "og:title");
  report.description = metaContent(html, "og:description");
  const image = metaContent(html, "og:image");

  if (!report.title)
    problems.push({
      id: "missing-title",
      severity: "error",
      message: "The published page has no og:title.",
      resolution:
        "Re-export after deploying so the release carries its share metadata.",
    });
  if (!report.description)
    problems.push({
      id: "missing-description",
      severity: "warning",
      message: "The published page has no og:description.",
      resolution: "Add a story description, then re-export and redeploy.",
    });
  if (html.includes("{{PUBLICATION_URL}}"))
    problems.push({
      id: "unresolved-placeholder",
      severity: "error",
      message:
        "The published page still contains the {{PUBLICATION_URL}} placeholder.",
      resolution:
        "Export again with your published URL, then redeploy the release folder.",
    });

  if (!image) {
    problems.push({
      id: "missing-image",
      severity: "error",
      message:
        "The published page has no og:image, so the link shows no artwork.",
      resolution: "Generate a share card, then re-export and redeploy.",
    });
    return report;
  }

  let imageUrl: URL;
  try {
    imageUrl = new URL(image);
  } catch {
    problems.push({
      id: "relative-image",
      severity: "error",
      message:
        "The og:image is not an absolute URL, so platforms cannot fetch it.",
      resolution:
        "Export again with your published URL so the image resolves absolutely.",
    });
    return report;
  }
  report.imageUrl = imageUrl.toString();

  try {
    const response = await authorizedFetch(imageUrl.toString(), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      problems.push({
        id: "image-unreachable",
        severity: "error",
        message: `The link preview image returned ${response.status}.`,
        resolution: "Confirm the share folder deployed alongside the story.",
      });
      return report;
    }
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/"))
      problems.push({
        id: "image-content-type",
        severity: "error",
        message: `The link preview image is served as ${type || "an unknown type"}.`,
        resolution: "Configure your host to serve PNG files as image/png.",
      });
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > 0) {
      report.imageBytes = declared;
      if (declared > MAX_CARD_BYTES)
        problems.push({
          id: "image-too-large",
          severity: "warning",
          message:
            "The link preview image is larger than 5 MB and may be skipped.",
          resolution: "Regenerate the share card at a smaller size.",
        });
    }
    await response.body?.cancel();
  } catch (cause) {
    problems.push({
      id: "image-unreachable",
      severity: "error",
      message: "Earth Stories could not reach the link preview image.",
      resolution:
        cause instanceof Error ? cause.message : "Check the deployed files.",
    });
  }

  const width = Number(metaContent(html, "og:image:width"));
  const height = Number(metaContent(html, "og:image:height"));
  if (Number.isFinite(width) && Number.isFinite(height) && height > 0) {
    const ratio = width / height;
    if (Math.abs(ratio - CARD_ASPECT) > ASPECT_TOLERANCE)
      problems.push({
        id: "image-aspect",
        severity: "warning",
        message:
          "The declared preview image shape is not the 1.91:1 platforms crop to.",
        resolution: "Regenerate the share card so it matches 1200×627.",
      });
  }

  return report;
}

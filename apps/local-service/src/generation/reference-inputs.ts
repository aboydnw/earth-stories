import { readReferenceBody } from "./webpage-capture.js";
import { prepareWebpageReference, decodeWebpage } from "./webpage-reference.js";
import { dirname, join, sep } from "node:path";
import { createRequire } from "node:module";
import { authorizedFetch } from "@earth-stories/publisher";
import type {
  PreparedReference,
  ReferenceInput,
} from "@earth-stories/story-schema";
const MAX = 20 * 1024 * 1024;
function rasterType(bytes: Uint8Array): string | null {
  const b = Buffer.from(bytes);
  if (
    b.length >= 24 &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (b.length >= 4 && b[0] === 255 && b[1] === 216 && b[2] === 255)
    return "image/jpeg";
  if (
    b.length >= 12 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return null;
}
export async function normalizeRaster(bytes: Uint8Array): Promise<Buffer> {
  if (bytes.byteLength > MAX || !rasterType(bytes))
    throw new Error("Use a PNG, JPEG, or WebP image smaller than 20 MiB.");
  const { imageSize } = await import("image-size");
  const size = imageSize(bytes);
  if (
    !size.width ||
    !size.height ||
    size.width > 8192 ||
    size.height > 8192 ||
    size.width * size.height > 16 * 1024 * 1024
  )
    throw new Error(
      "Images must contain at most 16 million pixels with neither edge above 8192 pixels.",
    );
  const { loadImage, createCanvas } = await import("@napi-rs/canvas");
  const image = await loadImage(Buffer.from(bytes));
  if (image.width !== size.width || image.height !== size.height)
    throw new Error("Image dimensions failed validation.");
  const canvas = createCanvas(size.width, size.height);
  canvas.getContext("2d").drawImage(image, 0, 0);
  const output = await canvas.encode("png");
  if (output.length > MAX) throw new Error("Decoded image is too large.");
  return output;
}

async function extract(
  bytes: Uint8Array,
  type: string,
): Promise<{ text?: string; image?: string }> {
  if (bytes.length > MAX)
    throw new Error("Each reference must be smaller than 20 MiB.");
  if (type.startsWith("image/")) {
    if (rasterType(bytes) !== type)
      throw new Error("Image contents do not match the declared media type.");
  }
  if (type.startsWith("image/"))
    return {
      image: `data:image/png;base64,${(await normalizeRaster(bytes)).toString("base64")}`,
    };
  if (type === "application/pdf") {
    if (Buffer.from(bytes.slice(0, 5)).toString() !== "%PDF-")
      throw new Error("This file is not a PDF.");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfRoot = dirname(
      createRequire(import.meta.url).resolve("pdfjs-dist/package.json"),
    );
    const loading = getDocument({
      standardFontDataUrl: join(pdfRoot, "standard_fonts") + sep,
      cMapUrl: join(pdfRoot, "cmaps") + sep,
      cMapPacked: true,
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      useSystemFonts: false,
      stopAtErrors: true,
    });
    try {
      const pdf = await loading.promise;
      if (pdf.numPages > 100)
        throw new Error("Use a PDF with 100 pages or fewer.");
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text +=
          content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ") + "\n";
        page.cleanup();
        if (text.length > 200000)
          throw new Error("PDF text exceeds the reference limit.");
      }
      if (!text.trim())
        throw new Error(
          "This PDF has no extractable text. Supply a text version of scanned pages.",
        );
      return { text };
    } finally {
      await loading.destroy();
    }
  }
  if (type !== "text/plain" && type !== "text/markdown")
    throw new Error(
      "Use TXT, Markdown, extractable PDF, PNG, JPEG, or WebP references.",
    );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (text.includes("\0")) throw new Error("Reference is not plain text.");
  return { text };
}
export async function prepareReferences(
  inputs: ReferenceInput[],
  signal: AbortSignal,
): Promise<PreparedReference[]> {
  const output: PreparedReference[] = [];
  let characters = 0,
    totalBytes = 0;
  for (const [index, input] of inputs.entries()) {
    signal.throwIfAborted();
    let content: {
      text?: string;
      image?: string;
      sourceUrl?: string;
      requestedUrl?: string;
      notes?: string;
      warnings?: string[];
    };
    if (input.kind === "text") content = { text: input.text };
    else if (input.kind === "upload") {
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data))
        throw new Error("Invalid reference encoding.");
      const bytes = Buffer.from(input.data, "base64");
      totalBytes += bytes.length;
      content = await extract(bytes, input.mediaType);
    } else {
      const timeout = AbortSignal.any([signal, AbortSignal.timeout(20000)]);
      const response = await abortable(
        timeout,
        authorizedFetch(
          input.url,
          {
            signal: timeout,
            headers: {
              accept:
                "text/html,text/plain,text/markdown,application/pdf,image/png,image/jpeg,image/webp",
            },
          },
          { httpsOnly: true, maxRedirects: 3 },
        ),
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Reference download returned ${response.status}.`);
      }
      const bytes = await readReferenceBody(response, MAX, timeout);
      totalBytes += bytes.length;
      const type =
        response.headers
          .get("content-type")
          ?.split(";")[0]
          ?.trim()
          .toLowerCase() ?? "";
      const sourceUrl = response.url || input.url;
      content =
        type === "text/html"
          ? await prepareWebpageReference(
              sourceUrl,
              decodeWebpage(bytes, response.headers.get("content-type") ?? ""),
              signal,
            )
          : await extract(bytes, type);
      content = {
        ...content,
        sourceUrl,
        requestedUrl: input.url,
        ...(input.notes ? { notes: input.notes } : {}),
      };
    }
    characters += (content.text?.length ?? 0) + (content.notes?.length ?? 0);
    if (characters > 200000 || totalBytes > 100 * 1024 * 1024)
      throw new Error("References exceed the combined text or file limit.");
    output.push({
      id: `reference-${index + 1}`,
      name: input.name,
      classification: input.classification,
      ...content,
    });
  }
  return output;
}

async function abortable<T>(
  signal: AbortSignal,
  operation: Promise<T>,
): Promise<T> {
  let cancel: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    cancel = () =>
      reject(signal.reason ?? new Error("Reference download cancelled."));
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

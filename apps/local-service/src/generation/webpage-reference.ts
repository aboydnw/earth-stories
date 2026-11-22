import { captureReferencePage } from "./webpage-capture.js";
/** Plain text extraction only; this output is never treated as trusted markup or instructions. */
export function extractWebpageText(html: string): string {
  const parts: string[] = [];
  let ignored: string | null = null;
  // Scan once; repeated unclosed script tags must not cause quadratic matching.
  for (const match of html
    .slice(0, 2 * 1024 * 1024)
    .matchAll(/<!--[\s\S]*?(?:-->|$)|<[^<>]{0,10000}>|[^<]+|</g)) {
    const token = match[0];
    if (token.startsWith("<!--")) continue;
    if (token.startsWith("<")) {
      const tag = /^<\s*(\/?)\s*([a-z][a-z0-9:-]*)/i.exec(token);
      if (tag) {
        const name = tag[2]!.toLowerCase();
        if (ignored === name && tag[1]) ignored = null;
        else if (
          !ignored &&
          !tag[1] &&
          ["script", "style", "noscript", "template"].includes(name)
        )
          ignored = name;
      }
      if (!ignored) parts.push(" ");
    } else if (!ignored) parts.push(token);
  }
  return parts
    .join("")
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp);/g,
      (e) =>
        ({
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&apos;": "'",
          "&nbsp;": " ",
        })[e]!,
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40000);
}
export async function prepareWebpageReference(
  url: string,
  html: string,
  signal: AbortSignal,
): Promise<{ text: string; image?: string; warnings: string[] }> {
  const text = extractWebpageText(html);
  const limits =
    html.length > 2 * 1024 * 1024 || text.length === 40000
      ? ["Page text was truncated to the reference inspection limit."]
      : [];
  try {
    const capture = await captureReferencePage(url, html, signal);
    return {
      text,
      image: `data:image/png;base64,${capture.image}`,
      warnings: [
        ...limits,
        ...(capture.partial
          ? [
              "Webpage appearance is a static preview with scripts disabled; some page resources were unavailable.",
            ]
          : [
              "Webpage appearance is a static preview with scripts disabled; interactive content was not inspected.",
            ]),
      ],
    };
  } catch {
    signal.throwIfAborted();
    return {
      text,
      warnings: [
        ...limits,
        "Webpage text was inspected, but its appearance could not be captured. Upload a screenshot to supply visual style.",
      ],
    };
  }
}

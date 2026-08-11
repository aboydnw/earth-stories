import { escapeAttribute } from "./html.js";
import { normalizePublicationUrl } from "./publication-url.js";

export interface EmbedOptions {
  publicationUrl: string;
  title: string;
  height?: number;
}

export function createEmbedSnippet({
  publicationUrl,
  title,
  height = 700,
}: EmbedOptions): string {
  const base = normalizePublicationUrl(publicationUrl);
  const src = `${base}/embed.html`;
  return `<iframe src="${escapeAttribute(src)}" style="width:100%;height:100vh;min-height:500px;border:0" height="${height}" title="${escapeAttribute(title)}" loading="lazy" allowfullscreen></iframe>`;
}

export function embedInstructions(title: string): string {
  return `${title}\n\nDeploy every file in this folder first. Replace {{PUBLICATION_URL}} with the public URL of that folder, then paste the iframe into your website.\n\n${createEmbedSnippet({ publicationUrl: "{{PUBLICATION_URL}}", title })}\n`;
}

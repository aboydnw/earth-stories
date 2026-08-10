import type { StoryProject } from "@earth-stories/story-schema";

export const PUBLICATION_URL_PLACEHOLDER = "{{PUBLICATION_URL}}";
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

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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

function normalizeBase(publicationUrl: string): string {
  const base = publicationUrl.replace(/\/+$/, "");
  if (base !== PUBLICATION_URL_PLACEHOLDER) {
    const parsed = new URL(base);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      throw new Error("Publication URL must use HTTP or HTTPS");
  }
  return base;
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
  const base = normalizeBase(publicationUrl);
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
  if (existing.test(html)) return html.replace(existing, metaTags);
  const headClose = html.search(/<\/head\s*>/i);
  if (headClose !== -1)
    return `${html.slice(0, headClose)}${metaTags}${html.slice(headClose)}`;
  const doctype = html.match(/^\s*<!doctype[^>]*>/i)?.[0];
  return doctype
    ? `${doctype}${metaTags}${html.slice(doctype.length)}`
    : `${metaTags}${html}`;
}

export const PUBLICATION_URL_PLACEHOLDER = "{{PUBLICATION_URL}}";

/**
 * Prepends https:// when a URL has no scheme, so authors can paste addresses
 * the way they see them ("example.org/my-story", "localhost:8080/story").
 * Anything already carrying a scheme — including non-web schemes such as
 * javascript: or mailto: — is returned unchanged for the caller to validate.
 */
export function withHttpScheme(value: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(value)) return value;
  return `https://${value}`;
}

/**
 * Normalizes an author-supplied publication URL into the canonical base that
 * share metadata and embed snippets reference: scheme-less input gains
 * https://, and query strings, fragments, and trailing slashes are dropped.
 * The placeholder passes through untouched so an unpublished build can be
 * rebaked with the real URL later.
 */
export function normalizePublicationUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed === PUBLICATION_URL_PLACEHOLDER) return trimmed;
  let parsed: URL;
  try {
    parsed = new URL(withHttpScheme(trimmed));
  } catch {
    throw new Error(
      `The deployed publication URL "${trimmed}" is not a web address`,
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    throw new Error("Publication URL must use HTTP or HTTPS");
  if (parsed.username || parsed.password)
    throw new Error("Publication URL must not include credentials");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

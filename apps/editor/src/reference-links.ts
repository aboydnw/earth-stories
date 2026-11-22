import type { ReferenceInput } from "@earth-stories/story-schema";
export function parseReferenceLinks(value: string): ReferenceInput[] {
  return value.split("\n").flatMap((line, index) => {
    line = line.trim();
    if (!line) return [];
    const fail = (
      detail = "Use a complete HTTPS link or public domain with optional notes.",
    ) => new Error(`Reference on line ${index + 1}: ${detail}`);
    // Explicit schemes take precedence, so unsafe schemes cannot be reinterpreted as a bare domain.
    const matches = [
      ...line.matchAll(
        /(?:[a-z][a-z0-9+.-]*:\/\/[^\s<>"`]+)|(?:\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?:[/:?#][^\s<>"`]*)?)/gi,
      ),
    ];
    if (matches.length !== 1)
      throw fail(
        matches.length > 1
          ? "Put one link per line so each explanation stays with its link."
          : undefined,
      );
    const match = matches[0]!,
      raw = match[0];
    const token = raw === line ? raw : raw.replace(/[.,;!?)]+$/, "");
    let url: string;
    try {
      const parsed = new URL(
        token.includes("://") ? token : `https://${token}`,
      );
      if (
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        parsed.href.length > 2048
      )
        throw fail();
      url = token.startsWith("https://") ? token : parsed.href;
    } catch {
      throw fail();
    }
    const notes = (
      line.slice(0, match.index) + line.slice(match.index! + raw.length)
    ).trim();
    if (notes.length > 4000)
      throw fail("Keep the explanation under 4,000 characters.");
    return [
      {
        kind: "url",
        name: url.slice(0, 200),
        classification: "background",
        url,
        ...(notes ? { notes } : {}),
      },
    ];
  });
}

import type { ReferenceInput } from "@earth-stories/story-schema";

export function parseReferenceLinks(value: string): ReferenceInput[] {
  return value.split("\n").flatMap((line, index) => {
    const url = line.trim();
    if (!url) return [];
    try {
      if (/\s/.test(url)) throw new Error();
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || url.length > 2048) throw new Error();
    } catch {
      throw new Error(
        `Reference link on line ${index + 1} must be a complete HTTPS URL (up to 2,048 characters). Put one link per line, or remove it to continue without it. Put descriptions in Visual direction or Story context and source material.`,
      );
    }
    return [
      {
        kind: "url",
        name: url.slice(0, 200),
        classification: "background",
        url,
      },
    ];
  });
}

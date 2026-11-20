import { expect, it } from "vitest";
import { parseReferenceLinks } from "./reference-links";

it("ignores blank lines and preserves complete signed URLs", () => {
  const url =
    "https://example.org/file%20name.pdf?signature=" + "a".repeat(300);
  expect(parseReferenceLinks(`\n  ${url}  \n`)).toEqual([
    { kind: "url", name: url.slice(0, 200), classification: "background", url },
  ]);
  expect(parseReferenceLinks("  \n")).toEqual([]);
});
it.each([
  "example.org/report.pdf",
  "some background notes",
  "https://example.org/report.pdf see page 4",
  "https://example.org/report.pdf\tsee-page-4",
  "for stylistic reference, the bird egg and overall look and feel of this page: https://searchingforbirds.visualcinnamon.com/",
  "http://example.org",
  "file:///tmp/a.pdf",
  "https://",
  "https://example.org/" + "x".repeat(2048),
])("explains invalid links without exposing their contents: %s", (value) => {
  expect(() =>
    parseReferenceLinks(`https://example.org/report.pdf\n\n${value}`),
  ).toThrow(
    new Error(
      "Reference link on line 3 must be a complete HTTPS URL (up to 2,048 characters). Put one link per line, or remove it to continue without it. Put descriptions in Visual direction or Story context and source material.",
    ),
  );
});

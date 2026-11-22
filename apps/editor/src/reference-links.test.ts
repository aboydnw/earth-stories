import { expect, it } from "vitest";
import { parseReferenceLinks } from "./reference-links";
it("preserves signed URLs and ignores blank lines", () => {
  const url =
    "https://example.org/file%20name.pdf?signature=" + "a".repeat(300);
  expect(parseReferenceLinks(`\n ${url}\n`)).toEqual([
    { kind: "url", name: url.slice(0, 200), classification: "background", url },
  ]);
  expect(parseReferenceLinks(" \n")).toEqual([]);
});
it("extracts annotated URLs and normalizes unambiguous bare domains", () => {
  expect(
    parseReferenceLinks("google.com is a good reference for styles"),
  ).toEqual([
    {
      kind: "url",
      name: "https://google.com/".slice(0, 200),
      classification: "background",
      url: "https://google.com/",
      notes: "is a good reference for styles",
    },
  ]);
  const result = parseReferenceLinks(
    "For the bird egg and overall feel: https://searchingforbirds.visualcinnamon.com/",
  );
  expect(result[0]).toMatchObject({
    url: "https://searchingforbirds.visualcinnamon.com/",
    notes: "For the bird egg and overall feel:",
  });
});
it("keeps different annotations with their links and rejects ambiguous multiple links", () => {
  expect(
    parseReferenceLinks(
      "https://example.org/a warm colors\nhttps://example.net/b flowing shapes",
    ).map((x) => (x.kind === "url" ? x.notes : "")),
  ).toEqual(["warm colors", "flowing shapes"]);
  expect(() =>
    parseReferenceLinks("https://example.org/a or https://example.net/b"),
  ).toThrow(/one link per line/i);
});
it.each([
  "some background notes",
  "http://example.org",
  "file:///tmp/a.pdf",
  "https://",
  "https://user:pass@example.org",
  "https://example.org/" + "x".repeat(2048),
])("explains invalid lines without echoing their contents", (value) => {
  expect(() => parseReferenceLinks(value)).toThrow(/Reference.*line 1/);
});

it("keeps filenames in the notes of an explicit link", () => {
  expect(
    parseReferenceLinks(
      "https://example.org/a see the chart in figure.png and data.json",
    )[0],
  ).toMatchObject({
    url: "https://example.org/a",
    notes: "see the chart in figure.png and data.json",
  });
});
it.each([
  "Match the Node.js docs palette",
  "see the chart in figure.png",
  "use data.json and figure.png",
  "figure.png",
  "Node.js docs palette",
])(
  "does not reinterpret ambiguous prose or a filename as a bare domain: %s",
  (value) => {
    expect(() => parseReferenceLinks(value)).toThrow(/Reference.*line 1/);
  },
);
it("accepts a leading bare domain with a filename in its notes", () => {
  expect(
    parseReferenceLinks("google.com use spacing like figure.png")[0],
  ).toMatchObject({
    url: "https://google.com/",
    notes: "use spacing like figure.png",
  });
});

it("accepts a file path beneath an unambiguous bare host", () => {
  expect(
    parseReferenceLinks("example.org/figure.png use its colors")[0],
  ).toMatchObject({
    url: "https://example.org/figure.png",
    notes: "use its colors",
  });
});

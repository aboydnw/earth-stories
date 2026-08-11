import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

import { checkShareLink, decodeShareCard } from "./share-health.js";

const VALID_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNQcLAAAAEcAJlbA0QyAAAAAElFTkSuQmCC";
const pngDataUrl = () => `data:image/png;base64,${VALID_PNG_BASE64}`;
const signatureOnlyDataUrl = () =>
  `data:image/png;base64,${Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("arbitrary bytes that are not a real image at all"),
  ]).toString("base64")}`;

const page = (body: string) =>
  new Response(body, {
    status: 200,
    headers: { "content-type": "text/html" },
  });

const image = (headers: Record<string, string>) =>
  new Response("binary", { status: 200, headers });

function shareHtml(overrides: Record<string, string | null> = {}) {
  const tags: Record<string, string | null> = {
    "og:title": "Field Notes",
    "og:description": "A coastline, mapped.",
    "og:image": "https://example.org/story/share/card-1.png",
    "og:image:width": "1200",
    "og:image:height": "627",
    ...overrides,
  };
  return `<!doctype html><html><head>${Object.entries(tags)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `<meta property="${key}" content="${value}">`)
    .join("")}</head><body></body></html>`;
}

afterEach(() => vi.restoreAllMocks());

describe("decodeShareCard", () => {
  it("accepts a PNG data URL", () => {
    expect(decodeShareCard(pngDataUrl()).byteLength).toBeGreaterThan(8);
  });

  it("rejects a JPEG data URL", () => {
    expect(() =>
      decodeShareCard("data:image/jpeg;base64,/9j/4AAQSkZJRg=="),
    ).toThrow();
  });

  it("rejects base64 that is not really a PNG", () => {
    expect(() =>
      decodeShareCard(
        `data:image/png;base64,${Buffer.from("<svg/>").toString("base64")}`,
      ),
    ).toThrow();
  });

  it("rejects arbitrary bytes wearing a PNG signature", () => {
    expect(() => decodeShareCard(signatureOnlyDataUrl())).toThrow();
  });

  it("rejects an oversized payload before decoding it", () => {
    const oversized = `data:image/png;base64,${"A".repeat(8 * 1024 * 1024)}`;
    expect(() => decodeShareCard(oversized)).toThrow(/larger than 5 MB/);
  });

  it("rejects a non-string payload", () => {
    expect(() => decodeShareCard({ image: true })).toThrow();
  });
});

describe("checkShareLink", () => {
  it("reports a healthy unfurl with no problems", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith(".png")
        ? image({ "content-type": "image/png", "content-length": "180000" })
        : page(shareHtml()),
    );
    const report = await checkShareLink("https://example.org/story/");
    expect(report.reachable).toBe(true);
    expect(report.title).toBe("Field Notes");
    expect(report.imageBytes).toBe(180000);
    expect(report.problems).toEqual([]);
  });

  it("flags an unresolved placeholder as an error", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith(".png")
        ? image({ "content-type": "image/png" })
        : page(
            shareHtml({ "og:image": "{{PUBLICATION_URL}}/share/card-1.png" }),
          ),
    );
    const report = await checkShareLink("https://example.org/story/");
    expect(report.problems).toContainEqual(
      expect.objectContaining({
        id: "unresolved-placeholder",
        severity: "error",
      }),
    );
  });

  it("flags a relative preview image platforms cannot fetch", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      page(shareHtml({ "og:image": "share/card-1.png" })),
    );
    const report = await checkShareLink("https://example.org/story/");
    expect(report.problems).toContainEqual(
      expect.objectContaining({ id: "relative-image", severity: "error" }),
    );
  });

  it("flags a preview image served with the wrong content type", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith(".png")
        ? image({ "content-type": "text/html" })
        : page(shareHtml()),
    );
    const report = await checkShareLink("https://example.org/story/");
    expect(report.problems).toContainEqual(
      expect.objectContaining({ id: "image-content-type" }),
    );
  });

  it("warns when the declared card shape is not what platforms crop to", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith(".png")
        ? image({ "content-type": "image/png" })
        : page(
            shareHtml({ "og:image:width": "600", "og:image:height": "600" }),
          ),
    );
    const report = await checkShareLink("https://example.org/story/");
    expect(report.problems).toContainEqual(
      expect.objectContaining({ id: "image-aspect", severity: "warning" }),
    );
  });

  it("reports an unreachable page without inspecting metadata", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response("", { status: 404 }),
    );
    const report = await checkShareLink("https://example.org/story/");
    expect(report.reachable).toBe(false);
    expect(report.problems).toContainEqual(
      expect.objectContaining({ id: "page-unreachable", severity: "error" }),
    );
  });

  it("rejects a URL that is not HTTP or HTTPS", async () => {
    await expect(checkShareLink("ftp://example.org/story")).rejects.toThrow();
  });

  it("reads metadata containing apostrophes without truncating it", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith(".png")
        ? image({ "content-type": "image/png" })
        : page(
            shareHtml({
              "og:title": "'Tis the Coastline",
              "og:description": "It's a coastline, mapped.",
            }),
          ),
    );
    const report = await checkShareLink("https://example.org/story/");
    expect(report.title).toBe("'Tis the Coastline");
    expect(report.description).toBe("It's a coastline, mapped.");
    expect(report.problems).toEqual([]);
  });

  it("skips the aspect check when a dimension is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith(".png")
        ? image({ "content-type": "image/png" })
        : page(shareHtml({ "og:image:width": null })),
    );
    const report = await checkShareLink("https://example.org/story/");
    expect(report.problems).toEqual([]);
  });

  it("accepts a URL pasted without a scheme", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith(".png")
        ? image({ "content-type": "image/png", "content-length": "180000" })
        : page(shareHtml()),
    );
    const report = await checkShareLink("example.org/story/");
    expect(report.reachable).toBe(true);
    expect(report.problems).toEqual([]);
  });

  it("checks a story served on this computer", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith(".png")
        ? image({ "content-type": "image/png" })
        : page(
            shareHtml({
              "og:image": "http://localhost:8080/story/share/card-1.png",
            }),
          ),
    );
    const report = await checkShareLink("http://localhost:8080/story/");
    expect(report.reachable).toBe(true);
    expect(report.problems).toEqual([]);
  });

  it("explains that private-network URLs cannot be checked", async () => {
    const report = await checkShareLink("http://192.168.1.20/story/");
    expect(report.reachable).toBe(false);
    expect(report.problems).toContainEqual(
      expect.objectContaining({ id: "private-host", severity: "error" }),
    );
  });

  it("does not treat a 127-prefixed hostname as this computer", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => page(shareHtml()));
    await checkShareLink("http://127.attacker.example/story/");
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(0);
    for (const [, init] of fetchSpy.mock.calls)
      expect(init && "dispatcher" in init).toBe(true);
  });

  it("refuses to follow a local page redirecting off this computer", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://192.168.1.20/story/" },
        }),
    );
    const report = await checkShareLink("http://localhost:8080/story/");
    expect(report.reachable).toBe(false);
    expect(report.problems).toContainEqual(
      expect.objectContaining({
        id: "page-unreachable",
        resolution: "The local page redirected away from this computer.",
      }),
    );
  });

  it("flags a public page whose preview image points at this computer", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      page(shareHtml({ "og:image": "http://localhost:8080/share/card-1.png" })),
    );
    const report = await checkShareLink("https://example.org/story/");
    expect(report.problems).toContainEqual(
      expect.objectContaining({ id: "image-local", severity: "error" }),
    );
  });
});

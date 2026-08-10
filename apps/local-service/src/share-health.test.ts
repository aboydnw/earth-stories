import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

import { checkShareLink, decodeShareCard } from "./share-health.js";

const pngDataUrl = (body = "share-card") =>
  `data:image/png;base64,${Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(body),
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
});

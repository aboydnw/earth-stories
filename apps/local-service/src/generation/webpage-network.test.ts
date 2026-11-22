import { expect, it, vi } from "vitest";
import { captureReferencePage } from "./webpage-capture.js";
import { prepareReferences } from "./reference-inputs.js";
import { prepareWebpageReference } from "./webpage-reference.js";
vi.mock("./webpage-reference.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./webpage-reference.js")>()),
  prepareWebpageReference: vi.fn(async () => ({
    text: "A public page",
    warnings: ["Appearance unavailable"],
  })),
}));
it.each([
  "https://127.0.0.1/private",
  "https://user:pass@example.org/",
  "file:///etc/passwd",
  "http://example.org/",
])("rejects unsafe browser navigation before launching: %s", async (url) => {
  await expect(
    captureReferencePage(url, "<p>test</p>", new AbortController().signal),
  ).rejects.toThrow();
});
it("prepares HTML through the authorized fetch boundary and preserves notes and final source", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("<h1>Page</h1>", {
      headers: { "content-type": "text/html" },
    }),
  );
  // Public literal avoids external DNS; fetch is mocked and no network request occurs.
  try {
    const result = await prepareReferences(
      [
        {
          kind: "url",
          name: "Style",
          classification: "visual-style",
          url: "https://1.1.1.1/",
          notes: "Use its spacing",
        },
      ],
      new AbortController().signal,
    );
    expect(result[0]).toMatchObject({
      notes: "Use its spacing",
      sourceUrl: "https://1.1.1.1/",
      requestedUrl: "https://1.1.1.1/",
      text: "A public page",
    });
    expect(prepareWebpageReference).toHaveBeenCalled();
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ redirect: "manual" });
  } finally {
    fetcher.mockRestore();
  }
});
it("blocks an HTML redirect to a private address", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { location: "https://127.0.0.1/private" },
    }),
  );
  try {
    await expect(
      prepareReferences(
        [
          {
            kind: "url",
            name: "Page",
            classification: "background",
            url: "https://1.1.1.1/",
          },
        ],
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    fetcher.mockRestore();
  }
});

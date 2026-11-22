import { expect, it, vi } from "vitest";
import { captureReferencePage, readReferenceBody } from "./webpage-capture.js";
vi.mock("./webpage-capture.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./webpage-capture.js")>()),
  captureReferencePage: vi.fn(),
}));
import {
  extractWebpageText,
  prepareWebpageReference,
} from "./webpage-reference.js";
it("extracts bounded page content without script or style source", () => {
  const text = extractWebpageText(
    "<title>Coast &amp; ice</title><script>steal()</script><style>body{color:red}</style><h1>Glaciers</h1><p>Ice retreats.</p>",
  );
  expect(text).toContain("Coast & ice");
  expect(text).toContain("Ice retreats.");
  expect(text).not.toContain("steal");
  expect(text).not.toContain("color:red");
});
it("limits extracted page text", () => {
  expect(
    extractWebpageText("<p>" + "x".repeat(100000) + "</p>").length,
  ).toBeLessThanOrEqual(40000);
});

it("reports text-only inspection when the isolated browser is unavailable", async () => {
  vi.mocked(captureReferencePage).mockRejectedValue(new Error("unavailable"));
  const result = await prepareWebpageReference(
    "https://example.org/",
    "<h1>Coastal ice</h1>",
    new AbortController().signal,
  );
  expect(result.text).toBe("Coastal ice");
  expect(result.image).toBeUndefined();
  expect(result.warnings.join()).toContain("appearance could not be captured");
});
it("keeps captured appearance and limited inspection separate from reference text", async () => {
  vi.mocked(captureReferencePage).mockResolvedValue({
    image: "cG5n",
    partial: true,
  });
  const result = await prepareWebpageReference(
    "https://example.org/",
    "<p>Ice</p>",
    new AbortController().signal,
  );
  expect(result.image).toBe("data:image/png;base64,cG5n");
  expect(result.warnings.join()).toContain("resources were unavailable");
});
it("does not turn cancellation into a successful text fallback", async () => {
  const control = new AbortController();
  control.abort();
  vi.mocked(captureReferencePage).mockRejectedValue(control.signal.reason);
  await expect(
    prepareWebpageReference("https://example.org/", "", control.signal),
  ).rejects.toThrow();
});
it("bounds streamed resources and cancels oversized and aborted readers", async () => {
  const cancel = vi.fn();
  const response = new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(12));
      },
      cancel,
    }),
  );
  await expect(
    readReferenceBody(response, 10, new AbortController().signal),
  ).rejects.toThrow("too large");
  expect(cancel).toHaveBeenCalled();
  const control = new AbortController();
  const stopped = vi.fn();
  const pending = readReferenceBody(
    new Response(new ReadableStream({ cancel: stopped })),
    10,
    control.signal,
  );
  control.abort();
  await expect(pending).rejects.toThrow();
  expect(stopped).toHaveBeenCalled();
});

it("ignores comments and handles repeated unclosed script tags in a bounded scan", () => {
  expect(extractWebpageText("<!-- hidden instructions --><h1>Coast</h1>")).toBe(
    "Coast",
  );
  expect(extractWebpageText("<script>".repeat(20000))).toBe("");
});

// @vitest-environment jsdom
import { expect, it, vi, afterEach } from "vitest";
import type { PublicationManifest } from "@earth-stories/story-schema";
import { captureEnhancementMaps } from "./EnhancementContextCapture";
vi.mock("@earth-stories/viewer", () => ({
  FocusedChapterViewer: ({ chapterId }: { chapterId: string }) => (
    <section className="story-chapter--scrolly" data-chapter-id={chapterId}>
      <div
        className="story-map"
        data-map-ready={chapterId === "delayed" ? "false" : "true"}
      >
        <canvas width="10" height="10" data-frame={chapterId} />
      </div>
    </section>
  ),
}));
afterEach(() => vi.restoreAllMocks());
it("captures each guided chapter independently and releases the off-screen viewer", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as any);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
    function (this: HTMLCanvasElement) {
      return `data:image/png;base64,${document.querySelector("[data-frame]")?.getAttribute("data-frame")}`;
    },
  );
  const manifest = {
    chapters: [
      { id: "bahamas", type: "scrolly" },
      { id: "florida", type: "scrolly" },
      { id: "atlantic", type: "scrolly" },
      { id: "carolinas", type: "scrolly" },
      { id: "text", type: "prose" },
    ],
  } as PublicationManifest;
  const result = await captureEnhancementMaps(
    manifest,
    new AbortController().signal,
  );
  expect(result).toEqual({
    bahamas: "data:image/png;base64,bahamas",
    florida: "data:image/png;base64,florida",
    atlantic: "data:image/png;base64,atlantic",
    carolinas: "data:image/png;base64,carolinas",
  });
  expect(document.querySelector("[data-context-capture]")).toBeNull();
});
it("does not mount or capture an abandoned request", async () => {
  const control = new AbortController();
  control.abort();
  await expect(
    captureEnhancementMaps({ chapters: [] } as any, control.signal),
  ).rejects.toThrow();
  expect(document.querySelector("[data-context-capture]")).toBeNull();
});

it("waits for the matching delayed map and omits a tainted canvas", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as any);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => {
    throw new DOMException("Tainted canvas", "SecurityError");
  });
  const capture = captureEnhancementMaps(
    { chapters: [{ id: "delayed", type: "map" }] } as any,
    new AbortController().signal,
  );
  expect(document.querySelector("[data-context-capture]")).not.toBeNull();
  document.querySelector(".story-map")!.setAttribute("data-map-ready", "true");
  expect(await capture).toEqual({});
  expect(document.querySelector("[data-context-capture]")).toBeNull();
});
it("releases a mounted map when capture is cancelled while waiting for readiness", async () => {
  const controller = new AbortController();
  const capture = captureEnhancementMaps(
    { chapters: [{ id: "delayed", type: "map" }] } as any,
    controller.signal,
  );
  controller.abort();
  await expect(capture).rejects.toThrow();
  expect(document.querySelector("[data-context-capture]")).toBeNull();
});

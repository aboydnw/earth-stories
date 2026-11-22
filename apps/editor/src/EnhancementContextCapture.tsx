import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { FocusedChapterViewer } from "@earth-stories/viewer";
import type { PublicationManifest } from "@earth-stories/story-schema";
import { captureMapSnapshots } from "./captureSnapshots";

/** A separate measurable renderer per map prevents capturing a shared scrolly map's wrong camera. */
export async function captureEnhancementMaps(
  manifest: PublicationManifest,
  signal: AbortSignal,
): Promise<Record<string, string>> {
  signal.throwIfAborted();
  const maps: Record<string, string> = {};
  for (const chapter of manifest.chapters
    .filter((c) => ["map", "scrolly", "flyover"].includes(c.type))
    .slice(0, 12)) {
    signal.throwIfAborted();
    const host = document.createElement("div");
    host.dataset.contextCapture = "";
    host.inert = true;
    host.setAttribute("aria-hidden", "true");
    Object.assign(host.style, {
      position: "fixed",
      left: "-20000px",
      top: "0",
      width: "1200px",
      height: "800px",
      overflow: "hidden",
      pointerEvents: "none",
    });
    document.body.append(host);
    const root = createRoot(host);
    try {
      flushSync(() =>
        root.render(
          <FocusedChapterViewer
            manifest={manifest}
            chapterId={chapter.id}
            snapshotMode
          />,
        ),
      );
      // The lazy map renderer can appear after the first commit. Readiness belongs to this chapter only.
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          observer.disconnect();
          signal.removeEventListener("abort", abort);
        };
        const finish = () => {
          cleanup();
          resolve();
        };
        const abort = () => {
          cleanup();
          reject(signal.reason);
        };
        const observer = new MutationObserver(() => {
          if (host.querySelector('[data-map-ready="true"]')) finish();
        });
        const timer = setTimeout(finish, 10000);
        observer.observe(host, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["data-map-ready"],
        });
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
        else if (host.querySelector('[data-map-ready="true"]')) finish();
      });
      signal.throwIfAborted();
      if (host.querySelector('[data-map-ready="true"]'))
        Object.assign(maps, await captureMapSnapshots(host));
      signal.throwIfAborted();
    } finally {
      root.unmount();
      host.remove();
    }
  }
  return maps;
}

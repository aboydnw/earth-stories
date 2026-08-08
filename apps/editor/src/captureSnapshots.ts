import { zipSync } from "fflate";

const MAP_READY_TIMEOUT_MS = 10_000;

function safeProjectTitle(projectTitle: string) {
  return (
    projectTitle
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "earth-story"
  );
}

function downloadArchive(
  filename: string,
  files: Record<string, Uint8Array>,
): number {
  const names = Object.keys(files);
  if (!names.length) return 0;
  const href = URL.createObjectURL(
    new Blob([zipSync(files)], { type: "application/zip" }),
  );
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
  return names.length;
}

function decodeDataUrl(dataUrl: string): Uint8Array {
  const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
}

async function waitForMap(map: HTMLElement): Promise<void> {
  if (map.dataset.mapReady === "true") return;
  await new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (map.dataset.mapReady === "true") finish();
    });
    const timer = window.setTimeout(finish, MAP_READY_TIMEOUT_MS);
    function finish() {
      window.clearTimeout(timer);
      observer.disconnect();
      resolve();
    }
    observer.observe(map, {
      attributes: true,
      attributeFilter: ["data-map-ready"],
    });
  });
}

export async function captureMapSnapshots(
  root: ParentNode = document,
): Promise<Record<string, string>> {
  const snapshots: Record<string, string> = {};
  const sections = [
    ...root.querySelectorAll<HTMLElement>(
      ".story-chapter--map, .story-chapter--scrolly, .story-chapter--flyover",
    ),
  ];
  await Promise.all(
    sections.map(async (section) => {
      const map = section.querySelector<HTMLElement>(".story-map");
      if (map) await waitForMap(map);
    }),
  );
  for (const section of sections) {
    const id = section.dataset.chapterId;
    const map = section.querySelector<HTMLElement>(".story-map");
    const canvases = [
      ...section.querySelectorAll<HTMLCanvasElement>(".story-map canvas"),
    ];
    const first = canvases[0];
    if (
      !id ||
      map?.dataset.mapReady !== "true" ||
      !first ||
      first.width === 0 ||
      first.height === 0
    )
      continue;
    try {
      const output = document.createElement("canvas");
      output.width = first.width;
      const attribution =
        map
          ?.querySelector<HTMLElement>(".maplibregl-ctrl-attrib")
          ?.innerText.trim() ?? "";
      const ratio = first.width / (first.clientWidth || first.width);
      const footerHeight = attribution ? Math.round(32 * ratio) : 0;
      output.height = first.height + footerHeight;
      const context = output.getContext("2d");
      if (!context) continue;
      for (const canvas of canvases)
        context.drawImage(canvas, 0, 0, output.width, first.height);
      if (attribution) {
        context.fillStyle = "rgba(255,255,255,.92)";
        context.fillRect(0, first.height, output.width, footerHeight);
        context.fillStyle = "#443f3f";
        context.font = `${Math.round(12 * ratio)}px system-ui, sans-serif`;
        context.textBaseline = "middle";
        context.fillText(
          attribution.slice(0, 180),
          Math.round(12 * ratio),
          first.height + footerHeight / 2,
          output.width - Math.round(24 * ratio),
        );
      }
      snapshots[id] = output.toDataURL("image/png");
    } catch {
      /* A cross-origin tile can taint the canvas; archival output will show a visible fallback. */
    }
  }
  return snapshots;
}

export async function downloadMapSnapshots(
  projectTitle: string,
  root: ParentNode = document,
): Promise<number> {
  const snapshots = await captureMapSnapshots(root);
  const safeTitle = safeProjectTitle(projectTitle);
  return downloadArchive(
    `${safeTitle}-map-images.zip`,
    Object.fromEntries(
      Object.entries(snapshots).map(([chapterId, dataUrl]) => [
        `${safeTitle}-${chapterId}.png`,
        decodeDataUrl(dataUrl),
      ]),
    ),
  );
}

function captureMimeType() {
  if (typeof MediaRecorder === "undefined") return undefined;
  return [
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm",
  ].find((type) => MediaRecorder.isTypeSupported(type));
}

export async function downloadAnimatedMapCaptures(
  projectTitle: string,
  durationMs = 6_000,
  root: ParentNode = document,
): Promise<{ count: number; format: "mp4" | "webm" }> {
  if (typeof HTMLCanvasElement.prototype.captureStream !== "function")
    throw new Error("This browser cannot record animated map captures.");
  const mimeType = captureMimeType();
  if (!mimeType)
    throw new Error("This browser cannot record animated map captures.");
  const format = mimeType.includes("mp4") ? "mp4" : "webm";
  const safeTitle = safeProjectTitle(projectTitle);
  const sections = [
    ...root.querySelectorAll<HTMLElement>(
      ".story-chapter--map, .story-chapter--scrolly, .story-chapter--flyover",
    ),
  ];
  const captures: Record<string, Uint8Array> = {};
  for (const section of sections) {
    const map = section.querySelector<HTMLElement>(".story-map");
    if (map) await waitForMap(map);
    const canvas =
      section.querySelector<HTMLCanvasElement>(".story-map canvas");
    const chapterId = section.dataset.chapterId;
    if (!canvas || !chapterId || canvas.width === 0 || canvas.height === 0)
      continue;
    const stream = canvas.captureStream(30);
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 5_000_000,
    });
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () =>
        reject(new Error("Animated map recording failed."));
      recorder.onstop = () => resolve();
    });
    try {
      section
        .querySelectorAll<HTMLButtonElement>(".story-map__time button")
        .forEach((button) => {
          if (button.getAttribute("aria-label") === "Play animation")
            button.click();
        });
      recorder.start(250);
      await new Promise((resolve) => window.setTimeout(resolve, durationMs));
      if (recorder.state !== "inactive") recorder.stop();
      await stopped;
    } finally {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (!chunks.length) continue;
    const blob = new Blob(chunks, { type: mimeType });
    if (!blob.size) continue;
    captures[`${safeTitle}-${chapterId}.${format}`] = new Uint8Array(
      await blob.arrayBuffer(),
    );
  }
  return {
    count: downloadArchive(`${safeTitle}-animated-maps.zip`, captures),
    format,
  };
}

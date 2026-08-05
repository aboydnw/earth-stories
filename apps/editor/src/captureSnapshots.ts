const MAP_READY_TIMEOUT_MS = 10_000;

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
      const footerHeight = attribution ? 32 : 0;
      output.height = first.height + footerHeight;
      const context = output.getContext("2d");
      if (!context) continue;
      for (const canvas of canvases)
        context.drawImage(canvas, 0, 0, output.width, first.height);
      if (attribution) {
        context.fillStyle = "rgba(255,255,255,.92)";
        context.fillRect(0, first.height, output.width, footerHeight);
        context.fillStyle = "#443f3f";
        context.font = "12px system-ui, sans-serif";
        context.textBaseline = "middle";
        context.fillText(
          attribution.slice(0, 180),
          12,
          first.height + footerHeight / 2,
          output.width - 24,
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
  const safeTitle =
    projectTitle
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "earth-story";
  for (const [chapterId, dataUrl] of Object.entries(snapshots)) {
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = `${safeTitle}-${chapterId}.png`;
    anchor.click();
  }
  return Object.keys(snapshots).length;
}

function captureMimeType() {
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
  const mimeType = captureMimeType();
  if (!mimeType || typeof MediaRecorder === "undefined")
    throw new Error("This browser cannot record animated map captures.");
  const format = mimeType.includes("mp4") ? "mp4" : "webm";
  const safeTitle =
    projectTitle
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "earth-story";
  const sections = [
    ...root.querySelectorAll<HTMLElement>(
      ".story-chapter--map, .story-chapter--scrolly, .story-chapter--flyover",
    ),
  ];
  let count = 0;
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
    section
      .querySelectorAll<HTMLButtonElement>(".story-map__time button")
      .forEach((button) => {
        if (button.textContent?.trim() === "Play") button.click();
      });
    recorder.start(250);
    await new Promise((resolve) => window.setTimeout(resolve, durationMs));
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    const href = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${safeTitle}-${chapterId}.${format}`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
    count += 1;
  }
  return { count, format };
}

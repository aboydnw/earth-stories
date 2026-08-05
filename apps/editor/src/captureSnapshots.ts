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
      output.height = first.height;
      const context = output.getContext("2d");
      if (!context) continue;
      for (const canvas of canvases)
        context.drawImage(canvas, 0, 0, output.width, output.height);
      snapshots[id] = output.toDataURL("image/png");
    } catch {
      /* A cross-origin tile can taint the canvas; archival output will show a visible fallback. */
    }
  }
  return snapshots;
}

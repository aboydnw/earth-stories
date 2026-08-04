export function captureMapSnapshots(
  root: ParentNode = document,
): Record<string, string> {
  const snapshots: Record<string, string> = {};
  for (const section of root.querySelectorAll<HTMLElement>(
    ".story-chapter--map, .story-chapter--scrolly",
  )) {
    const id = section.dataset.chapterId;
    const canvases = [
      ...section.querySelectorAll<HTMLCanvasElement>(".story-map canvas"),
    ];
    const first = canvases[0];
    if (!id || !first || first.width === 0 || first.height === 0) continue;
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

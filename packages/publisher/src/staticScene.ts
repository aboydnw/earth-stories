import {
  defaultReaderPalette,
  sceneFrame,
  type SceneDefinition,
  type ReaderPalette,
} from "@earth-stories/story-schema";
const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
/** Emit only validated primitives; image URLs must be embedded raster data. */
export function staticScene(
  scene: SceneDefinition,
  alt: string,
  images: Map<string, string>,
  palette: ReaderPalette = {},
): string {
  const colors = { ...defaultReaderPalette, ...palette };
  const frames = sceneFrame(scene, scene.staticProgress);
  const layers = scene.layers
    .map((layer, index) => {
      const f = frames[index]!,
        w = layer.width * scene.width,
        h = layer.height * scene.height;
      let content = "";
      if (layer.kind === "text")
        content = `<text y="${layer.fontSize * scene.width}" font-size="${layer.fontSize * scene.width}" fill="${colors[layer.colorRole]}">${escape(layer.text)}</text>`;
      if (layer.kind === "path")
        content = `<path d="${escape(layer.pathData)}" transform="scale(${w} ${h})" fill="${layer.fillRole ? colors[layer.fillRole] : "none"}" stroke="${layer.strokeRole ? colors[layer.strokeRole] : "none"}" stroke-width="${layer.strokeWidth}"/>`;
      if (layer.kind === "image") {
        const src = images.get(layer.sourceId);
        content =
          src &&
          /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(src)
            ? `<image href="${src}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"><title>${escape(layer.alt)}</title></image>`
            : `<text y="24">${escape(`Artwork unavailable: ${layer.alt}`)}</text>`;
      }
      return `<g transform="translate(${f.x * scene.width} ${f.y * scene.height}) scale(${f.scale})" opacity="${f.opacity}"><svg width="${w * f.reveal}" height="${h}" overflow="hidden">${content}</svg></g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${scene.width} ${scene.height}" role="img" aria-label="${escape(alt)}"><title>${escape(alt)}</title><rect width="100%" height="100%" fill="${colors.surface}"/>${layers}</svg>`;
}

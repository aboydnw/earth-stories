import { z } from "zod";
import { normalizeRaster } from "./reference-inputs.js";
const encoded = z
  .string()
  .min(1)
  .max(28 * 1024 * 1024)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/);
export async function prepareArtworkImage(data: unknown) {
  const bytes = await normalizeRaster(
    Buffer.from(encoded.parse(data), "base64"),
  );
  const { loadImage, createCanvas } = await import("@napi-rs/canvas");
  const image = await loadImage(bytes);
  const ratio = Math.min(1, 512 / Math.max(image.width, image.height));
  const canvas = createCanvas(
    Math.max(1, Math.round(image.width * ratio)),
    Math.max(1, Math.round(image.height * ratio)),
  );
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let hasTransparency = false;
  for (let i = 3; i < pixels.length; i += 4)
    if (pixels[i]! < 255) {
      hasTransparency = true;
      break;
    }
  return {
    data: bytes.toString("base64"),
    thumbnail: (await canvas.encode("png")).toString("base64"),
    width: image.width,
    height: image.height,
    hasTransparency,
  };
}

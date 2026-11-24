import { expect, it } from "vitest";
import { prepareArtworkImage } from "./artwork.js";
import { createCanvas } from "@napi-rs/canvas";
it("validates artwork and provides a bounded transparent thumbnail", async () => {
  const canvas = createCanvas(1200, 800);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#123456";
  ctx.fillRect(0, 0, 400, 400);
  const input = (await canvas.encode("png")).toString("base64");
  const result = await prepareArtworkImage(input);
  expect(result.width).toBe(1200);
  expect(result.height).toBe(800);
  const { imageSize } = await import("image-size");
  expect(imageSize(Buffer.from(result.thumbnail, "base64")).width).toBe(512);
  expect(result.hasTransparency).toBe(true);
  expect(Buffer.from(result.data, "base64").subarray(1, 4).toString()).toBe(
    "PNG",
  );
});
it("rejects invalid or oversized artwork before storing anything", async () => {
  await expect(
    prepareArtworkImage(
      Buffer.from('<svg onload="evil()"/>').toString("base64"),
    ),
  ).rejects.toThrow();
  await expect(prepareArtworkImage("not base64!")).rejects.toThrow();
  const canvas = createCanvas(9000, 1);
  await expect(
    prepareArtworkImage((await canvas.encode("png")).toString("base64")),
  ).rejects.toThrow(/8192/);
});

import { expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { prepareSuppliedArtwork } from "./supplied-artwork.js";
import { storyBriefSchema, sceneSchema } from "@earth-stories/story-schema";
import { composePlan } from "./vector-plan.js";
const brief = storyBriefSchema.parse({
  title: "Ice",
  audience: "",
  takeaway: "",
  narrative: "",
  visualDirection: "Use the illustration throughout",
  references: [],
  requestedOutputs: ["illustration", "animation"],
});
it("prepares usable original and optional aligned layers, with honest provenance and bounded thumbnails", async () => {
  const data = (await createCanvas(800, 600).encode("png")).toString("base64");
  const result = await prepareSuppliedArtwork(
    [
      {
        kind: "upload",
        name: "Ice",
        classification: "visual-style",
        mediaType: "image/png",
        data,
        artworkRole: "original",
      },
    ],
    new AbortController().signal,
  );
  expect(result.assets).toHaveLength(1);
  expect(result.assets[0]?.origin).toBe("supplied");
  expect(result.references[0]?.artwork?.sourceId).toBe(result.assets[0]?.id);
  expect(result.references[0]?.image?.length).toBeLessThan(10000);
  const bad = (await createCanvas(400, 600).encode("png")).toString("base64");
  await expect(
    prepareSuppliedArtwork(
      [
        {
          kind: "upload",
          name: "Layer",
          classification: "visual-style",
          mediaType: "image/png",
          data: bad,
          artworkRole: "layer",
        },
      ],
      new AbortController().signal,
    ),
  ).rejects.toThrow(/original/i);
});
it("accepts supplied images in a sequence and rejects invented image IDs", () => {
  const scene = sceneSchema.parse({
    width: 800,
    height: 600,
    layers: [
      {
        id: "ice",
        kind: "image",
        sourceId: "supplied-ice",
        alt: "Ice",
        keyframes: [
          { at: 0, x: 0, y: 0, scale: 1, opacity: 1, reveal: 1 },
          { at: 1, x: 0, y: -0.04, scale: 1, opacity: 1, reveal: 1 },
        ],
      },
    ],
  });
  const output = {
    title: "Ice",
    description: "",
    palette: "alpine",
    chapters: [],
    visualSequences: [
      {
        id: "opening-art",
        alt: "Ice",
        caption: "Illustrative",
        scene,
        steps: [{ chapterId: "opening", start: 0, end: 1 }],
      },
    ],
    visualAccents: [],
    textEdits: [],
    warnings: [],
  };
  expect(
    composePlan(output, brief, true, ["supplied-ice"]).visualSequences?.[0]
      ?.scene.layers[0]?.kind,
  ).toBe("image");
  expect(() => composePlan(output, brief, true, ["another-image"])).toThrow(
    /supplied|unknown/i,
  );
});

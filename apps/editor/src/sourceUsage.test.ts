import { expect, it } from "vitest";
import { sceneSchema } from "@earth-stories/story-schema";
import { sourceChapterIds } from "./sourceUsage";
it("protects images used only in sequences or companion art and counts each chapter once", () => {
  const scene = sceneSchema.parse({
    width: 800,
    height: 600,
    layers: [{ id: "ice", kind: "image", sourceId: "art", alt: "Ice" }],
  });
  expect(
    sourceChapterIds(
      {
        chapters: [
          {
            id: "a",
            type: "illustrated",
            title: "A",
            narrative: "",
            alt: "Ice",
            caption: "",
            scene,
          },
          { id: "b", type: "prose", title: "B", narrative: "" },
          { id: "c", type: "prose", title: "C", narrative: "" },
        ],
        visualSequences: [
          {
            id: "sequence",
            alt: "Ice",
            caption: "",
            scene,
            steps: [
              { chapterId: "a", start: 0, end: 0.5 },
              { chapterId: "b", start: 0.5, end: 1 },
            ],
          },
        ],
        visualAccents: [
          {
            id: "accent",
            chapterId: "c",
            placement: "trailing",
            alt: "Ice",
            scene,
          },
        ],
      },
      "art",
    ),
  ).toEqual(["a", "b", "c"]);
});

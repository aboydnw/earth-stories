import { expect, it } from "vitest";
import { enhancementDirections } from "./enhancementDirections";
import { storyBriefSchema } from "@earth-stories/story-schema";
it("retains both legacy direction fields and accepts their combined maximum", () => {
  const text = enhancementDirections({
    narrative: "a".repeat(50000),
    visualDirection: "b".repeat(10000),
  });
  expect(text.length).toBe(60002);
  expect(
    storyBriefSchema.safeParse({
      title: "Ice",
      audience: "",
      takeaway: "",
      narrative: "",
      visualDirection: text,
      references: [],
      requestedOutputs: ["illustration"],
    }).success,
  ).toBe(true);
});

import { expect, it } from "vitest";
import { sceneSchema } from "@earth-stories/story-schema";
import { staticScene } from "./staticScene.js";
it("exports the authored still frame with text escaped and no network image URLs", () => {
  const scene = sceneSchema.parse({
    width: 1000,
    height: 600,
    staticProgress: 0.5,
    layers: [
      {
        id: "t",
        kind: "text",
        text: "<script>bad</script>",
        keyframes: [
          { at: 0, x: 0, y: 0, scale: 1, opacity: 1, reveal: 1 },
          { at: 1, x: 1, y: 0, scale: 1, opacity: 1, reveal: 1 },
        ],
      },
      { id: "i", kind: "image", sourceId: "art", alt: "Sea" },
    ],
  });
  const svg = staticScene(
    scene,
    "Sea",
    new Map([["art", "https://example.com/image.png"]]),
  );
  expect(svg).toContain("translate(500 0)");
  expect(svg).toContain("&lt;script&gt;");
  expect(svg).not.toContain("https:");
  expect(svg).toContain("Artwork unavailable: Sea");
  expect(staticScene(scene, "Sea", new Map())).toBe(
    staticScene(scene, "Sea", new Map()),
  );
});

it.each([
  ["atlas", "#faf5e9", "#203a49"],
  ["editorial", "#f6f1e8", "#332b27"],
] as const)(
  "uses %s defaults for missing palette roles",
  (theme, surface, text) => {
    const scene = sceneSchema.parse({
      width: 1000,
      height: 600,
      layers: [{ id: "t", kind: "text", text: "River", colorRole: "text" }],
    });
    const svg = staticScene(
      scene,
      "River",
      new Map(),
      { accent: "#112233" },
      theme,
    );
    expect(svg).toContain(`fill="${surface}"`);
    expect(svg).toContain(`fill="${text}"`);
  },
);

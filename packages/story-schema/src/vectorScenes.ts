import { z } from "zod";
import {
  sceneSchema,
  type SceneLayer,
  type SceneKeyframe,
} from "./illustration.js";

export const vectorRecipeSchema = z
  .object({
    template: z.enum(["landscape", "flow", "reveal", "diagram"]),
    heading: z.string().trim().min(1).max(38),
    labels: z.array(z.string().trim().min(1).max(32)).min(2).max(4),
    motif: z.enum(["river", "mountains", "coast"]),
    motion: z.boolean(),
  })
  .strict();
export type VectorRecipe = z.infer<typeof vectorRecipeSchema>;
/** Curated normalized geometry. AI chooses content, never executable drawing code. */
export function composeVectorScene(recipe: VectorRecipe) {
  const r = vectorRecipeSchema.parse(recipe);
  const layers: SceneLayer[] = [];
  const track = (x: number, y: number, delay = 0): SceneKeyframe[] =>
    r.motion
      ? [
          { at: 0, x, y: y + 0.036, scale: 1, opacity: 0.25, reveal: 1 },
          {
            at: Math.min(0.85, 0.45 + delay),
            x,
            y,
            scale: 1,
            opacity: 1,
            reveal: 1,
          },
          { at: 1, x, y, scale: 1, opacity: 1, reveal: 1 },
        ]
      : [];
  const path = (
    id: string,
    d: string,
    x: number,
    y: number,
    w: number,
    h: number,
    role: "accent" | "text" | "mutedText" | "surface",
    opacity = 1,
    stroke = false,
  ) => {
    layers.push({
      id,
      kind: "path",
      pathData: d,
      x,
      y,
      width: w,
      height: h,
      opacity,
      keyframes: [],
      fillRole: stroke ? null : role,
      strokeRole: stroke ? role : null,
      strokeWidth: stroke ? 0.009 : 0,
    });
  };
  const text = (
    id: string,
    label: string,
    x: number,
    y: number,
    size = 0.044,
    delay = 0,
  ) => {
    layers.push({
      id,
      kind: "text",
      text: label,
      x,
      y,
      width: 0.84,
      height: 0.09,
      opacity: 1,
      keyframes: track(x, y, delay),
      fontSize: Math.min(
        size,
        (0.92 - x) /
          [...label].reduce(
            (sum, c) =>
              sum +
              (/[MW@%]/.test(c)
                ? 0.95
                : /[ilI., :;!]/.test(c)
                  ? 0.3
                  : /[A-Z0-9]/.test(c)
                    ? 0.7
                    : 0.58),
            0,
          ),
      ),
      colorRole: "text",
    });
  };
  text("heading", r.heading, 0.08, 0.065, 0.044);
  path(
    "rule",
    "M 0 0 L 1 0 L 1 1 L 0 1 Z",
    0.08,
    0.19,
    0.84,
    0.002,
    "mutedText",
    0.45,
  );
  if (r.template === "landscape") {
    // Three distinct silhouettes; the palette and supplied narrative carry meaning.
    const silhouettes =
      r.motif === "mountains"
        ? [
            "M 0 1 L 0 .65 L .2 .15 L .4 .65 L .65 0 L .9 .6 L 1 .4 L 1 1 Z",
            "M 0 1 L 0 .8 L .24 .2 L .5 .7 L .8 .35 L 1 .6 L 1 1 Z",
          ]
        : [
            "M 0 1 L 0 .35 C .2 .05 .35 .65 .55 .3 C .7 .05 .85 .1 1 .35 L 1 1 Z",
            "M 0 1 L 0 .6 C .25 .15 .4 .7 .65 .45 C .8 .2 .9 .65 1 .4 L 1 1 Z",
          ];
    path("distant", silhouettes[0]!, 0, 0.29, 1, 0.48, "mutedText", 0.24);
    path("middle", silhouettes[1]!, 0, 0.4, 1, 0.44, "accent", 0.28);
    path(
      "foreground",
      "M 0 1 L 0 .65 C .3 .15 .6 .9 1 .45 L 1 1 Z",
      0,
      0.5,
      1,
      0.4,
      "text",
      0.12,
    );
    path(
      "water",
      "M .46 0 C .28 .25 .8 .4 .52 .6 C .32 .75 .25 .85 .34 1 L .64 1 C .45 .85 .65 .7 .72 .55 C .9 .3 .4 .2 .57 0 Z",
      0,
      0.43,
      1,
      0.43,
      "accent",
      0.8,
    );
    for (let i = 1; i < 5; i++) {
      const layer = layers[i + 1];
      if (layer && r.motion)
        layer.keyframes = [
          {
            at: 0,
            x: layer.x,
            y: layer.y + 0.02 * i,
            scale: 1,
            opacity: 1,
            reveal: 1,
          },
          {
            at: 1,
            x: layer.x,
            y: layer.y,
            scale: 1,
            opacity: 1,
            reveal: 1,
          },
        ];
    }
    text("landscape-label", r.labels[0]!, 0.08, 0.25, 0.044);
    text("landscape-detail", r.labels[1]!, 0.08, 0.87, 0.044);
  } else if (r.template === "flow") {
    for (let i = 0; i < 3; i++)
      path(
        `contour-${i}`,
        "M 0 .7 C .25 -.2 .55 1.3 1 .15",
        0.08,
        0.26 + i * 0.045,
        0.84,
        0.16,
        "mutedText",
        0.16,
        true,
      );
    path(
      "flow",
      "M 0 .65 C .25 -.15 .55 1.2 1 .15",
      0.08,
      0.3,
      0.84,
      0.18,
      "accent",
      1,
      true,
    );
    const flow = layers.at(-1)!;
    if (r.motion)
      flow.keyframes = [
        { at: 0, x: 0.08, y: 0.3, scale: 1, opacity: 1, reveal: 0.03 },
        { at: 0.85, x: 0.08, y: 0.3, scale: 1, opacity: 1, reveal: 1 },
        { at: 1, x: 0.08, y: 0.3, scale: 1, opacity: 1, reveal: 1 },
      ];
    r.labels.forEach((label, i) => {
      const x = 0.08 + i * (0.84 / (r.labels.length - 1));
      path(
        `marker-${i}`,
        "M .5 0 L 1 .5 L .5 1 L 0 .5 Z",
        x - 0.008,
        0.49,
        0.016,
        0.027,
        "accent",
      );
      // Stack short labels beneath the path so long words cannot collide.
      text(
        `label-${i}`,
        `${String(i + 1).padStart(2, "0")}  ${label}`,
        0.08,
        0.6 + i * 0.09,
        0.044,
        i * 0.1,
      );
    });
  } else if (r.template === "reveal") {
    r.labels.forEach((label, i) => {
      const y = 0.29 + i * 0.155;
      path(
        `panel-${i}`,
        "M 0 0 L 1 0 L 1 1 L 0 1 Z",
        0.08,
        y,
        0.84,
        0.125,
        "mutedText",
        0.08,
      );
      path(
        `accent-${i}`,
        "M 0 0 L 1 0 L 1 1 L 0 1 Z",
        0.08,
        y,
        0.006,
        0.125,
        "accent",
      );
      text(
        `number-${i}`,
        String(i + 1).padStart(2, "0"),
        0.11,
        y + 0.026,
        0.028,
        i * 0.1,
      );
      text(`label-${i}`, label, 0.21, y + 0.032, 0.044, i * 0.1);
    });
  } else {
    // An ordered system diagram, deliberately without invented data magnitudes.
    path(
      "spine",
      "M 0 0 L 1 0 L 1 1 L 0 1 Z",
      0.14,
      0.3,
      0.0015,
      0.53,
      "mutedText",
      0.45,
    );
    r.labels.forEach((label, i) => {
      const y = 0.28 + i * 0.16;
      path(
        `node-${i}`,
        "M .5 0 C .78 0 1 .22 1 .5 C 1 .78 .78 1 .5 1 C .22 1 0 .78 0 .5 C 0 .22 .22 0 .5 0 Z",
        0.115,
        y,
        0.05,
        0.083,
        "accent",
      );
      path(
        `connector-${i}`,
        "M 0 0 L 1 0 L 1 1 L 0 1 Z",
        0.165,
        y + 0.04,
        0.07,
        0.002,
        "mutedText",
        0.5,
      );
      text(`label-${i}`, label, 0.26, y + 0.01, 0.044, i * 0.1);
    });
  }
  return sceneSchema.parse({
    width: 1000,
    height: 600,
    layers,
    staticProgress: 1,
    motionStrength: r.motion ? 0.65 : 0,
    scrollLength: 1.6,
  });
}

export const vectorScenePalettes = {
  estuary: {
    background: "#f2f5ef",
    surface: "#ffffff",
    text: "#173b3c",
    mutedText: "#4c6260",
    accent: "#25766b",
    accentText: "#1b6258",
  },
  clay: {
    background: "#f7f0e7",
    surface: "#fffaf4",
    text: "#402e29",
    mutedText: "#6d554b",
    accent: "#b44e31",
    accentText: "#963b22",
  },
  alpine: {
    background: "#edf2f7",
    surface: "#ffffff",
    text: "#263b50",
    mutedText: "#536275",
    accent: "#386c93",
    accentText: "#2a5a80",
  },
};

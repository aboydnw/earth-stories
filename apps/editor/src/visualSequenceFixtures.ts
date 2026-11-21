import {
  visualSequenceSchema,
  type VisualSequence,
  type ProjectChapter,
} from "@earth-stories/story-schema";
const key = (at: number, x: number, y: number, scale = 1, rotation = 0) => ({
  at,
  x,
  y,
  scale,
  rotation,
  opacity: 1,
  reveal: 1,
});
const path = (
  id: string,
  pathData: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fillRole = "accent",
  opacity = 1,
  keyframes: ReturnType<typeof key>[] = [],
) => ({
  id,
  kind: "path",
  pathData,
  x,
  y,
  width,
  height,
  fillRole,
  strokeRole: null,
  strokeWidth: 0,
  opacity,
  keyframes,
});
export const visualFixtureChapters: Extract<
  ProjectChapter,
  { type: "prose" }
>[] = [
  {
    id: "arrival",
    type: "prose",
    title: "A boundary in motion",
    narrative:
      "Watch the shape change as you move through the story. This illustration explains a process; it is not a measurement.",
  },
  {
    id: "change",
    type: "prose",
    title: "The next stage",
    narrative:
      "The same scene continues here. Its position and form carry the explanation forward while the text remains ordinary editable content.",
  },
];
function storm(): VisualSequence {
  const layers: unknown[] = [
    path("ocean", "M 0 0 L 1 0 L 1 1 L 0 1 Z", 0, 0, 1, 1, "accent", 0.16),
    path(
      "coast",
      "M .68 0 C .58 .12 .75 .21 .64 .35 C .52 .48 .7 .58 .58 .7 C .49 .81 .6 .9 .5 1 L 1 1 L 1 0 Z",
      0,
      0,
      1,
      1,
      "mutedText",
      0.28,
    ),
  ];
  for (let arm = 0; arm < 7; arm++) {
    const points: number[][] = [];
    for (let i = 0; i <= 55; i++) {
      const t = i / 55,
        a = (arm * Math.PI * 2) / 7 + t * 5.1,
        r = 0.085 + t * 0.39;
      points.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]);
    }
    for (let i = 55; i >= 0; i--) {
      const t = i / 55,
        a = (arm * Math.PI * 2) / 7 + t * 5.1,
        r = 0.05 + t * 0.36;
      points.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]);
    }
    const d =
      points
        .map(
          ([x, y], i) => `${i ? "L" : "M"} ${x!.toFixed(4)} ${y!.toFixed(4)}`,
        )
        .join(" ") + " Z";
    layers.push(
      path(
        `cloud-band-${arm}`,
        d,
        0.44,
        0.18,
        0.5,
        0.65,
        arm % 2 ? "surface" : "background",
        0.8,
        [
          key(0, 0.42, 0.12, 0.8, -20),
          key(0.5, 0.46, 0.17, 1, 35),
          key(1, 0.54, 0.24, 1.15, 100),
        ],
      ),
    );
  }
  layers.push(
    path(
      "eye",
      "M .5 .15 C .97 .15 .97 .85 .5 .85 C .03 .85 .03 .15 .5 .15 Z",
      0.66,
      0.42,
      0.055,
      0.07,
      "accent",
      0.8,
      [
        key(0, 0.612, 0.352, 0.8),
        key(0.5, 0.683, 0.46, 1),
        key(1, 0.796, 0.574, 1.15),
      ],
    ),
  );
  return visualSequenceSchema.parse({
    id: "storm-sequence",
    alt: "Spiral cloud bands rotate around a hurricane eye as the storm approaches a coastline",
    caption:
      "Illustrative storm motion; not a forecast or measured storm footprint.",
    scene: { width: 1200, height: 900, staticProgress: 0.7, layers },
    steps: [
      { chapterId: "arrival", start: 0, end: 0.5 },
      { chapterId: "change", start: 0.5, end: 1 },
    ],
  });
}
function glacier(): VisualSequence {
  const layers = [
    path("fjord", "M 0 0 L 1 0 L 1 1 L 0 1 Z", 0, 0, 1, 1, "accent", 0.3),
    path(
      "far-ridge",
      "M 0 1 L 0 .4 L .12 .2 L .2 .35 L .33 .06 L .48 .31 L .64 .1 L .78 .28 L .9 .08 L 1 .34 L 1 1 Z",
      0,
      0,
      1,
      0.6,
      "mutedText",
      0.65,
    ),
    path(
      "snowline",
      "M .1 .48 L .33 .06 L .48 .31 L .36 .22 L .3 .27 L .26 .23 Z",
      0,
      0,
      1,
      0.6,
      "surface",
      0.8,
    ),
    path(
      "valley-rock",
      "M 0 1 L .1 .7 L .24 .68 L .44 .4 L .54 .3 L .68 .42 L .82 .5 L 1 .6 L 1 1 Z",
      0,
      0.25,
      1,
      0.75,
      "text",
      0.35,
    ),
    path(
      "ice-body",
      "M .16 0 L .62 .02 L .7 .2 L .58 .36 L .8 .55 L .72 .72 L .93 .87 L .85 1 L .5 .94 L .22 1 L .05 .85 L .23 .65 L .1 .4 Z",
      0.49,
      0.24,
      0.36,
      0.54,
      "surface",
      1,
      [key(0, 0.49, 0.24, 1), key(1, 0.5, 0.24, 0.68)],
    ),
    path(
      "ice-face",
      "M 0 0 L .3 .1 L .6 .04 L 1 0 L .93 1 L .53 .8 L .1 .9 Z",
      0.52,
      0.73,
      0.3,
      0.08,
      "background",
      1,
      [key(0, 0.52, 0.73, 1), key(1, 0.52, 0.57, 0.68)],
    ),
  ];
  for (let i = 0; i < 8; i++)
    layers.push(
      path(
        `crevasse-${i}`,
        "M 0 0 L .35 .08 L .25 .24 L .65 .17 L 1 .3 L .6 .4 L .28 .32 Z",
        0.55 + (i % 2) * 0.04,
        0.3 + i * 0.05,
        0.16,
        0.027,
        "accent",
        0.35,
        [
          key(0, 0.55 + (i % 2) * 0.04, 0.3 + i * 0.05),
          key(1, 0.54 + (i % 2) * 0.03, 0.28 + i * 0.035, 0.68),
        ],
      ),
    );
  layers.push(
    path(
      "iceberg",
      "M 0 .7 L .35 0 L .8 .15 L 1 .8 L .5 1 Z",
      0.72,
      0.82,
      0.045,
      0.045,
      "surface",
      1,
      [key(0, 0.72, 0.82, 0.3), key(1, 0.82, 0.92, 1.1)],
    ),
  );
  return visualSequenceSchema.parse({
    id: "ice-sequence",
    alt: "A crevassed glacier retreats between mountain ridges, revealing water and rock",
    caption:
      "Illustrative retreat; geometry and timing do not represent a measured glacier front.",
    scene: { width: 1200, height: 900, staticProgress: 0.65, layers },
    steps: [
      { chapterId: "arrival", start: 0, end: 0.5 },
      { chapterId: "change", start: 0.5, end: 1 },
    ],
  });
}
export const hurricaneSequence = storm();
export const glacierSequence = glacier();

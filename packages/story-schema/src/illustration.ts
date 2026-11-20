import { z } from "zod";
const unit = z.number().finite().min(0).max(1);
const coordinate = z.number().finite().min(-4).max(4);
export const paletteRoles = [
  "background",
  "surface",
  "text",
  "mutedText",
  "accent",
  "accentText",
] as const;
export const paletteRoleSchema = z.enum(paletteRoles);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
export const readerPaletteSchema = z
  .object({
    background: color.optional(),
    surface: color.optional(),
    text: color.optional(),
    mutedText: color.optional(),
    accent: color.optional(),
    accentText: color.optional(),
  })
  .strict();
export type ReaderPalette = z.infer<typeof readerPaletteSchema>;

/** A deliberately small path grammar: no markup, URLs, or unbounded numbers. */
export function validScenePath(value: string): boolean {
  if (!value || value.length > 65536) return false;
  const tokens = value.match(
    /[MmLlHhVvCcSsQqTtZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g,
  );
  if (
    !tokens ||
    value.replace(
      /[MmLlHhVvCcSsQqTtZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?|[\s,]+/g,
      "",
    ) ||
    !/^[Mm]$/.test(tokens[0]!)
  )
    return false;
  const sizes: Record<string, number> = {
    m: 2,
    l: 2,
    h: 1,
    v: 1,
    c: 6,
    s: 4,
    q: 4,
    t: 2,
    z: 0,
  };
  let i = 0;
  while (i < tokens.length) {
    const command = tokens[i++]!.toLowerCase();
    const size = sizes[command];
    if (size === undefined) return false;
    let count = 0;
    while (i < tokens.length && !/^[a-z]$/i.test(tokens[i]!)) {
      const number = Number(tokens[i++]);
      if (!Number.isFinite(number) || Math.abs(number) > 1e6) return false;
      count++;
    }
    if (size === 0 ? count !== 0 : count === 0 || count % size !== 0)
      return false;
  }
  return true;
}
export const sceneKeyframeSchema = z
  .object({
    at: unit,
    x: coordinate,
    y: coordinate,
    scale: z.number().min(0.01).max(10),
    opacity: unit,
    reveal: unit,
  })
  .strict();
const keys = z
  .array(sceneKeyframeSchema)
  .max(20)
  .refine(
    (values) => values.every((v, i) => i === 0 || v.at > values[i - 1]!.at),
    "Keyframes must have increasing progress",
  );
const common = {
  id: z.string().min(1).max(100),
  x: coordinate.default(0),
  y: coordinate.default(0),
  width: z.number().positive().max(4).default(1),
  height: z.number().positive().max(4).default(1),
  opacity: unit.default(1),
  keyframes: keys.default([]),
};
const textLayer = z
  .object({
    ...common,
    kind: z.literal("text"),
    text: z.string().max(2000),
    fontSize: z.number().min(0.005).max(0.2).default(0.04),
    colorRole: paletteRoleSchema.default("text"),
  })
  .strict();
const pathLayer = z
  .object({
    ...common,
    kind: z.literal("path"),
    pathData: z
      .string()
      .refine(validScenePath, "Use supported vector path commands"),
    fillRole: paletteRoleSchema.nullable().default("accent"),
    strokeRole: paletteRoleSchema.nullable().default(null),
    strokeWidth: z.number().min(0).max(0.2).default(0.005),
  })
  .strict();
const imageFields = {
  ...common,
  kind: z.literal("image"),
  alt: z.string().max(2000),
};
export const sceneLayerSchema = z.discriminatedUnion("kind", [
  textLayer,
  pathLayer,
  z.object({ ...imageFields, sourceId: z.string().min(1) }).strict(),
]);
export const publicationSceneLayerSchema = z.discriminatedUnion("kind", [
  textLayer,
  pathLayer,
  z.object({ ...imageFields, assetId: z.string().min(1) }).strict(),
]);
const sceneFields = {
  width: z.number().int().min(100).max(4096),
  height: z.number().int().min(100).max(4096),
  staticProgress: unit.default(1),
  motionStrength: unit.default(1),
  scrollLength: z.number().min(0.5).max(5).default(2),
};
const unique = (layers: { id: string }[]) =>
  new Set(layers.map((l) => l.id)).size === layers.length;
export const sceneSchema = z
  .object({
    ...sceneFields,
    layers: z
      .array(sceneLayerSchema)
      .max(24)
      .refine(unique, "Layer IDs must be unique"),
  })
  .strict();
export const publicationSceneSchema = z
  .object({
    ...sceneFields,
    layers: z
      .array(publicationSceneLayerSchema)
      .max(24)
      .refine(unique, "Layer IDs must be unique"),
  })
  .strict();
export type SceneDefinition = z.infer<typeof sceneSchema>;
export type PublicationScene = z.infer<typeof publicationSceneSchema>;
export type SceneLayer = z.infer<typeof sceneLayerSchema>;
export type SceneKeyframe = z.infer<typeof sceneKeyframeSchema>;
export const defaultScene = (): SceneDefinition => ({
  width: 1000,
  height: 600,
  layers: [],
  staticProgress: 1,
  motionStrength: 1,
  scrollLength: 2,
});
export const defaultReaderPalette: Required<ReaderPalette> = {
  background: "#f5f3f0",
  surface: "#ffffff",
  text: "#443f3f",
  mutedText: "#716b68",
  accent: "#cf3f02",
  accentText: "#bf3a00",
};
export function paletteContrastWarnings(palette: ReaderPalette): string[] {
  const c = { ...defaultReaderPalette, ...palette };
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
  };
  return (
    [
      ["text", "background"],
      ["text", "surface"],
      ["mutedText", "background"],
      ["mutedText", "surface"],
      ["accentText", "background"],
      ["accentText", "surface"],
    ] as const
  ).flatMap(([a, b]) => {
    const x = luminance(c[a]),
      y = luminance(c[b]);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) < 4.5
      ? [`${a} on ${b} has insufficient text contrast`]
      : [];
  });
}

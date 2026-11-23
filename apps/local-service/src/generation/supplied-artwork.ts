import { createHash } from "node:crypto";
import { projectSourceSchema } from "@earth-stories/story-schema";
import type {
  ReferenceInput,
  PreparedReference,
  GeneratedAsset,
  ProjectSource,
  StoryPlan,
} from "@earth-stories/story-schema";
import { prepareArtworkImage } from "./artwork.js";
export async function prepareSuppliedArtwork(
  inputs: ReferenceInput[],
  signal: AbortSignal,
) {
  const selected = inputs.filter(
    (r): r is Extract<ReferenceInput, { kind: "upload" }> =>
      r.kind === "upload" && Boolean(r.artworkRole),
  );
  const assets: GeneratedAsset[] = [],
    references: PreparedReference[] = [],
    contents = new Map<string, Buffer>();
  if (!selected.length) return { assets, references, contents };
  if (
    selected.filter((r) => r.artworkRole === "original").length !== 1 ||
    selected.length > 7
  )
    throw new Error(
      "Supply one original illustration and at most six prepared layers.",
    );
  let dimensions = "",
    total = 0,
    normalizedTotal = 0;
  for (const input of [
    ...selected.filter((r) => r.artworkRole === "original"),
    ...selected.filter((r) => r.artworkRole === "layer"),
  ]) {
    signal.throwIfAborted();
    if (!input.mediaType.startsWith("image/"))
      throw new Error("Supplied artwork must be PNG, JPEG, or WebP.");
    total += Buffer.byteLength(input.data, "base64");
    if (total > 60 * 1024 * 1024)
      throw new Error("Supplied artwork must total at most 60 MiB.");
    const image = await prepareArtworkImage(input.data);
    signal.throwIfAborted();
    if (
      Math.min(image.width, image.height) < 100 ||
      Math.min(image.width, image.height) /
        Math.max(image.width, image.height) <
        100 / 4096
    )
      throw new Error(
        "Use artwork with both edges at least 100 pixels and a less extreme aspect ratio.",
      );
    const size = `${image.width}x${image.height}`;
    if (dimensions && size !== dimensions)
      throw new Error(
        "Prepared layers must use the same full canvas dimensions as the original illustration.",
      );
    dimensions = size;
    const bytes = Buffer.from(image.data, "base64"),
      digest = createHash("sha256").update(bytes).digest("hex");
    normalizedTotal += bytes.length;
    if (normalizedTotal > 100 * 1024 * 1024)
      throw new Error(
        "Normalized artwork exceeds 100 MiB. Supply smaller images.",
      );
    const id = `supplied-${digest.slice(0, 24)}`,
      path = `assets/${digest}.png`;
    if (assets.some((a) => a.id === id))
      throw new Error("Each supplied artwork image must be different.");
    assets.push({
      id,
      path,
      digest,
      sizeBytes: bytes.length,
      mediaType: "image/png",
      model: "",
      prompt: "",
      origin: "supplied",
      name: input.name,
    });
    contents.set(path, bytes);
    references.push({
      id,
      name: input.name,
      classification: "visual-style",
      image: `data:image/png;base64,${image.thumbnail}`,
      artwork: {
        sourceId: id,
        role: input.artworkRole!,
        width: image.width,
        height: image.height,
        hasTransparency: image.hasTransparency,
        digest,
        sizeBytes: bytes.length,
      },
    });
  }
  return { assets, references, contents };
}
export const suppliedSource = (asset: GeneratedAsset): ProjectSource =>
  projectSourceSchema.parse({
    id: asset.id,
    kind: "image",
    label: asset.name ?? "Supplied illustration",
    path: asset.path,
    delivery: "included",
    sizeBytes: asset.sizeBytes,
    provenance: {
      transformations: [
        "Supplied artwork normalized to PNG; no automatic layer separation",
      ],
    },
  });
export function validateSuppliedImages(plan: StoryPlan, ids: string[]) {
  const scenes = [
    ...plan.chapters.flatMap((c) => (c.scene ? [c.scene] : [])),
    ...(plan.visualSequences ?? []).map((s) => s.scene),
    ...(plan.visualAccents ?? []).map((s) => s.scene),
  ];
  const images = scenes.flatMap((s) =>
    s.layers.filter((l) => l.kind === "image"),
  );
  if (images.some((l) => !ids.includes(l.sourceId)))
    throw new Error("Scene references unknown supplied artwork.");
  if (ids.length && !images.length)
    throw new Error(
      "Use the supplied illustration in the story, not only as a style reference.",
    );
}

/** Reuse matching content-addressed sources without replacing authored metadata. */
export function validateSuppliedSources(
  assets: GeneratedAsset[],
  sources: ProjectSource[],
) {
  for (const asset of assets) {
    const existing = sources.find((s) => s.id === asset.id);
    if (
      existing &&
      (existing.kind !== "image" ||
        existing.path !== asset.path ||
        existing.sizeBytes !== asset.sizeBytes ||
        existing.delivery !== "included")
    )
      throw new Error("Supplied artwork conflicts with an existing source.");
  }
}

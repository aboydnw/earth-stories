export type Anchor = "house" | "shoreline";

export const studioTreatments = {
  original: { anchor: "shoreline", label: "together", camera: false },
  house: { anchor: "house", label: "together", camera: true },
  shoreline: { anchor: "shoreline", label: "staggered", camera: true },
} as const;

export type Treatment =
  | (typeof studioTreatments)[keyof typeof studioTreatments]
  | {
      anchor: "house";
      label: "staggered";
      camera: true;
    };

export function studioFrame(
  treatment: Treatment,
  progress: number,
  still = false,
) {
  const p = still ? 1 : Math.min(1, Math.max(0, progress));
  const orient = Math.min(1, p / 0.55);
  const ease = orient * orient * (3 - 2 * orient);
  return {
    scale: treatment.camera ? 1 + 0.38 * (1 - ease) : 1,
    anchorX: treatment.anchor === "house" ? 160 : 280,
    anchorY: treatment.anchor === "house" ? 190 : 250,
    foreground: 1 - ease,
    first: p >= 0.6,
    last: p >= 0.82,
    firstLabel: p >= (treatment.label === "staggered" ? 0.6 : 0.82),
    gap: p >= 0.92,
  };
}

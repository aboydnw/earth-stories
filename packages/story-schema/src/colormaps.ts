export const COLORMAP_NAMES = [
  "viridis",
  "magma",
  "inferno",
  "plasma",
  "cividis",
  "coolwarm",
  "rdylgn",
  "rdbu",
  "ylorrd",
  "terrain",
  "blues",
  "reds",
  "greens",
  "grayscale",
] as const;

export type ColormapName = (typeof COLORMAP_NAMES)[number];

const HEX_STOPS: Record<ColormapName, readonly string[]> = {
  viridis: [
    "#440154",
    "#482777",
    "#3f4a8a",
    "#31678e",
    "#26838f",
    "#1f9d8a",
    "#6cce5a",
    "#b6de2b",
    "#fee825",
  ],
  magma: [
    "#000004",
    "#180f3d",
    "#440f76",
    "#721f81",
    "#9e2f7f",
    "#cd4071",
    "#f1605d",
    "#fd9668",
    "#feca8d",
    "#fcfdbf",
  ],
  inferno: [
    "#000004",
    "#1b0c41",
    "#4a0c6b",
    "#781c6d",
    "#a52c60",
    "#cf4446",
    "#ed6925",
    "#fb9b06",
    "#f7d13d",
    "#fcffa4",
  ],
  plasma: [
    "#0d0887",
    "#46039f",
    "#7201a8",
    "#9c179e",
    "#bd3786",
    "#d8576b",
    "#ed7953",
    "#fb9f3a",
    "#fdca26",
    "#f0f921",
  ],
  cividis: [
    "#00224e",
    "#123570",
    "#1d4d80",
    "#2b6a8e",
    "#40849e",
    "#5ba3a4",
    "#82c09e",
    "#b0d88f",
    "#e3e479",
    "#fdea45",
  ],
  coolwarm: [
    "#3b4cc0",
    "#6788ee",
    "#9abbff",
    "#c9d7f0",
    "#edd1c2",
    "#f7a889",
    "#e26952",
    "#b40426",
  ],
  rdylgn: [
    "#a50026",
    "#d73027",
    "#f46d43",
    "#fdae61",
    "#fee08b",
    "#d9ef8b",
    "#a6d96a",
    "#66bd63",
    "#1a9850",
    "#006837",
  ],
  rdbu: [
    "#67001f",
    "#b2182b",
    "#d6604d",
    "#f4a582",
    "#fddbc7",
    "#d1e5f0",
    "#92c5de",
    "#4393c3",
    "#2166ac",
    "#053061",
  ],
  ylorrd: [
    "#ffffcc",
    "#ffeda0",
    "#fed976",
    "#feb24c",
    "#fd8d3c",
    "#fc4e2a",
    "#e31a1c",
    "#bd0026",
    "#800026",
  ],
  terrain: [
    "#333399",
    "#0099ff",
    "#00cc66",
    "#99e666",
    "#ffff99",
    "#b3a37a",
    "#cc9966",
    "#e6cccc",
    "#ffffff",
  ],
  blues: [
    "#f7fbff",
    "#deebf7",
    "#c6dbef",
    "#9ecae1",
    "#6baed6",
    "#4292c6",
    "#2171b5",
    "#08519c",
    "#08306b",
  ],
  reds: [
    "#fff5f0",
    "#fee0d2",
    "#fcbba1",
    "#fc9272",
    "#fb6a4a",
    "#ef3b2c",
    "#cb181d",
    "#a50f15",
    "#67000d",
  ],
  greens: [
    "#f7fcf5",
    "#e5f5e0",
    "#c7e9c0",
    "#a1d99b",
    "#74c476",
    "#41ab5d",
    "#238b45",
    "#006d2c",
    "#00441b",
  ],
  grayscale: ["#141414", "#808080", "#f5f5f5"],
};

function hexToUnit(hex: string): [number, number, number] {
  return [1, 3, 5].map(
    (offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255,
  ) as [number, number, number];
}

/** Colormap stops as 0–1 RGB triples, optionally reversed. */
export function colormapStops(
  name: ColormapName,
  reversed: boolean,
): Array<[number, number, number]> {
  const stops = HEX_STOPS[name].map(hexToUnit);
  return reversed ? stops.reverse() : stops;
}

/** CSS gradient for editor swatches. */
export function colormapGradient(
  name: ColormapName,
  reversed: boolean,
): string {
  const stops = [...HEX_STOPS[name]];
  if (reversed) stops.reverse();
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

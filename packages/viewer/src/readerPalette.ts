import type { CSSProperties } from "react";
import type { ReaderPalette } from "@earth-stories/story-schema";
export const paletteVariables = {
  background: "--story-canvas",
  surface: "--story-paper",
  text: "--story-ink",
  mutedText: "--story-muted",
  accent: "--story-accent",
  accentText: "--story-accent-text",
} as const;
export function readerPaletteStyle(palette?: ReaderPalette): CSSProperties {
  return Object.fromEntries(
    Object.entries(palette ?? {}).map(([role, value]) => [
      paletteVariables[role as keyof ReaderPalette],
      value,
    ]),
  ) as CSSProperties;
}
export function paletteColor(role: keyof ReaderPalette): string {
  return `var(${paletteVariables[role]})`;
}

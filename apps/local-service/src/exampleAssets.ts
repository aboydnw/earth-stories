import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TemplateAssetFile } from "@earth-stories/project-store";

const ASSETS_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "example-assets",
);

/**
 * Files bundled with each example template, generated ahead of time from the
 * real datasets those stories reference (see docs/examples.md). Materializing
 * a template copies these into the new project's assets/ directory, since
 * image and csv sources can only ever be included, never connected.
 */
const EXAMPLE_ASSET_FILES: Record<string, string[]> = {
  "example-boundaries": [
    "everest-relief.png",
    "everest-elevation.csv",
    "tile-pyramid.csv",
  ],
  "example-point-cloud": ["autzen-scatter.png", "autzen-classification.csv"],
  "example-temporal-fields": ["fields-iowa.png", "fields-probability.csv"],
  "example-storm-track": ["katrina-track.json", "katrina-intensity.csv"],
  "example-earthquakes": [
    "earthquake-history.csv",
    "earthquake-consequences.csv",
    "alaska-earthquake-damage.jpg",
  ],
  "example-electric-grid": [
    "generation-by-fuel.csv",
    "generating-units-by-technology.csv",
    "energy-hardware.png",
  ],
};

export async function loadExampleAssetFiles(
  storyId: string,
): Promise<TemplateAssetFile[]> {
  const filenames = EXAMPLE_ASSET_FILES[storyId] ?? [];
  return Promise.all(
    filenames.map(async (filename) => ({
      path: `assets/${filename}`,
      contents: await readFile(join(ASSETS_ROOT, storyId, filename)),
    })),
  );
}

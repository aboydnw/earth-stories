import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { buildPublication } from "@earth-stories/publisher";

function argumentsMap() {
  const values = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 2)
    values.set(process.argv[index]!, process.argv[index + 1]!);
  return values;
}

const values = argumentsMap();
const publicationUrl = values.get("--publication-url");
const output = values.get("--output");
if (!publicationUrl || !output)
  throw new Error("--publication-url and --output are required");

const repository = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(output);
await mkdir(outputDirectory, { recursive: true });
await buildPublication({
  projectDirectory: resolve(repository, "fixtures/geolibre-production-proof"),
  outputDirectory,
  viewerDirectory: resolve(repository, "dist/viewer"),
  publicationUrl,
});

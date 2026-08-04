import { resolve } from "node:path";
import { buildPublication } from "./build.js";

const [, , projectArg, outputArg, viewerArg] = process.argv;
if (!projectArg || !outputArg) {
  throw new Error(
    "Usage: publisher <project-directory> <output-directory> [viewer-directory]",
  );
}

const manifest = await buildPublication({
  projectDirectory: resolve(projectArg),
  outputDirectory: resolve(outputArg),
  viewerDirectory: viewerArg ? resolve(viewerArg) : undefined,
});

process.stdout.write(
  `Built ${manifest.metadata.title} (${manifest.build.id}) at ${resolve(outputArg)}\n`,
);

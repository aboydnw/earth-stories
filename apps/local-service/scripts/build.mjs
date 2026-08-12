import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(resolve(packageDirectory, "dist"), { recursive: true });
await build({
  entryPoints: [resolve(packageDirectory, "src/standalone.ts")],
  outfile: resolve(packageDirectory, "dist/service.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24.18.1",
  sourcemap: true,
  sourcesContent: true,
  packages: "bundle",
  external: ["node:*"],
});

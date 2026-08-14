import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const packageManifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

await build({
  entryPoints: [fileURLToPath(new URL("../src/preload.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist/preload.cjs", import.meta.url)),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  sourcemap: false,
  legalComments: "none",
  define: {
    __EARTH_STORIES_VERSION__: JSON.stringify(packageManifest.version),
  },
});

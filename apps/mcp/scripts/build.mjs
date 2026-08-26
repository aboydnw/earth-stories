import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(resolve(packageDirectory, "dist"), { recursive: true });
const result = await build({
  entryPoints: [resolve(packageDirectory, "src/main.ts")],
  outfile: resolve(packageDirectory, "dist/mcp.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24.18.1",
  sourcemap: true,
  sourcesContent: true,
  packages: "bundle",
  external: ["node:*"],
  metafile: true,
  banner: {
    js: 'import { createRequire as __earthStoriesCreateRequire } from "node:module"; const require = __earthStoriesCreateRequire(import.meta.url);',
  },
});

async function bundledPackage(input) {
  let directory = dirname(resolve(input));
  while (directory !== dirname(directory)) {
    if (!directory.includes(`${sep}node_modules${sep}`)) return null;
    try {
      const manifest = JSON.parse(
        await readFile(join(directory, "package.json"), "utf8"),
      );
      if (typeof manifest.name === "string")
        return {
          directory,
          name: manifest.name,
          version: typeof manifest.version === "string" ? manifest.version : "",
        };
    } catch {
      // Continue toward the dependency package root.
    }
    directory = dirname(directory);
  }
  return null;
}

const packages = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  const dependency = await bundledPackage(input);
  if (dependency) packages.set(dependency.directory, dependency);
}
const notices = [];
const packagedLicenses = new Map();
for (const dependency of [...packages.values()].sort((left, right) =>
  left.name.localeCompare(right.name),
)) {
  const licenseName = (await readdir(dependency.directory)).find((name) =>
    /^licen[cs]e(?:\.|$)/i.test(name),
  );
  const licensePath = licenseName
    ? join(dependency.directory, licenseName)
    : packagedLicenses.get(dependency.name);
  if (!licensePath)
    throw new Error(
      `Bundled dependency ${dependency.name} has no license file.`,
    );
  notices.push(
    `${dependency.name}${dependency.version ? ` ${dependency.version}` : ""}\n\n${(
      await readFile(licensePath, "utf8")
    ).trim()}`,
  );
}
await writeFile(
  resolve(packageDirectory, "dist/mcp.js.LICENSE.txt"),
  `Earth Stories MCP server — bundled third-party licenses\n\n${notices.join(
    "\n\n---\n\n",
  )}\n`,
);

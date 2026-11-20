import { createRequire } from "node:module";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(resolve(packageDirectory, "dist"), { recursive: true });
const result = await build({
  entryPoints: [resolve(packageDirectory, "src/standalone.ts")],
  outfile: resolve(packageDirectory, "dist/service.js"),
  define: {
    __EARTH_STORIES_GITHUB_APP_CONFIG__: JSON.stringify(
      process.env.EARTH_STORIES_GITHUB_APP_CLIENT_ID &&
        process.env.EARTH_STORIES_GITHUB_APP_SLUG &&
        process.env.EARTH_STORIES_GITHUB_BROKER_URL
        ? {
            clientId: process.env.EARTH_STORIES_GITHUB_APP_CLIENT_ID,
            appSlug: process.env.EARTH_STORIES_GITHUB_APP_SLUG,
            brokerUrl: process.env.EARTH_STORIES_GITHUB_BROKER_URL,
          }
        : null,
    ),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24.18.1",
  sourcemap: true,
  sourcesContent: true,
  packages: "bundle",
  external: ["node:*", "@napi-rs/canvas", "pdfjs-dist/*"],
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
// Native raster decoders and PDF workers must retain their package-relative files.
const runtimeDirectory = resolve(packageDirectory, "dist/node_modules");
await rm(runtimeDirectory, { recursive: true, force: true });
await mkdir(runtimeDirectory, { recursive: true });
const copied = new Map();
async function copyRuntime(
  name,
  from = resolve(packageDirectory, "package.json"),
  optional = false,
) {
  const require = createRequire(from);
  let manifestPath;
  try {
    manifestPath = require.resolve(`${name}/package.json`);
  } catch (error) {
    if (optional) return;
    throw error;
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (copied.has(name)) {
    if (copied.get(name) !== manifest.version)
      throw new Error(`Conflicting runtime dependency ${name}`);
    return;
  }
  copied.set(name, manifest.version);
  const directory = dirname(manifestPath);
  await cp(directory, join(runtimeDirectory, name), {
    recursive: true,
    filter: (path) => !path.startsWith(join(directory, "node_modules")),
  });
  packages.set(directory, {
    directory,
    name: manifest.name,
    version: manifest.version,
  });
  for (const dependency of Object.keys(manifest.dependencies ?? {}))
    await copyRuntime(dependency, manifestPath);
  for (const dependency of Object.keys(manifest.optionalDependencies ?? {}))
    await copyRuntime(dependency, manifestPath, true);
}
await copyRuntime("@napi-rs/canvas");
await copyRuntime("pdfjs-dist");
const notices = [];
const packagedLicenses = new Map([
  ["pmtiles", resolve(packageDirectory, "licenses/pmtiles-LICENSE")],
]);
for (const dependency of [...packages.values()].sort((left, right) =>
  left.name.localeCompare(right.name),
)) {
  const licenseName = (await readdir(dependency.directory)).find((name) =>
    /^licen[cs]e(?:\.|$)/i.test(name),
  );
  const licensePath = licenseName
    ? join(dependency.directory, licenseName)
    : dependency.name.startsWith("@napi-rs/canvas-")
      ? join(
          dirname(
            createRequire(resolve(packageDirectory, "package.json")).resolve(
              "@napi-rs/canvas/package.json",
            ),
          ),
          "LICENSE",
        )
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
  resolve(packageDirectory, "dist/service.js.LICENSE.txt"),
  `Earth Stories local service — bundled third-party licenses\n\n${notices.join(
    "\n\n---\n\n",
  )}\n`,
);

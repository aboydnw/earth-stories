import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const requiredResources = [
  "editor/index.html",
  "viewer/index.html",
  "credits/THIRD_PARTY_NOTICES.md",
];

export function evaluateInstalledApp(input) {
  const failures = [];
  for (const resource of requiredResources)
    if (!input.resources.includes(resource))
      failures.push(`missing-resource:${resource}`);
  if (
    input.privatePaths.some(
      (privatePath) =>
        privatePath && input.publicationText.includes(privatePath),
    )
  )
    failures.push("publication-leaks-private-path");
  if (input.geoLibreExternalOpened === false)
    failures.push("geolibre-external-navigation-not-observed");
  if (input.serviceStopped === false)
    failures.push("embedded-service-did-not-stop");
  return {
    version: 1,
    artifact: basename(input.artifactPath),
    platform: input.platform,
    architecture: input.architecture,
    checkedAt: input.checkedAt,
    checks: {
      packagedResources: requiredResources.every((resource) =>
        input.resources.includes(resource),
      ),
      publicationPrivacy:
        !failures.includes("publication-leaks-private-path"),
      geoLibreExternalNavigation:
        input.geoLibreExternalOpened === undefined
          ? "not-run"
          : input.geoLibreExternalOpened,
      serviceShutdown:
        input.serviceStopped === undefined ? "not-run" : input.serviceStopped,
    },
    failures,
  };
}

async function listFiles(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, path)));
    else if (entry.isFile()) files.push(relative(root, path).replaceAll("\\", "/"));
  }
  return files;
}

async function main() {
  const values = new Map();
  for (let index = 2; index < process.argv.length; index += 2)
    values.set(process.argv[index], process.argv[index + 1]);
  const appPath = values.get("--app");
  if (!appPath) throw new Error("--app is required");
  const artifactPath = resolve(appPath);
  const resourcesRoot = artifactPath.endsWith(".app")
    ? join(artifactPath, "Contents", "Resources")
    : join(artifactPath, "resources");
  let smoke = {};
  const smokePath = values.get("--smoke-evidence");
  if (smokePath) smoke = JSON.parse(await readFile(smokePath, "utf8"));
  const evidence = evaluateInstalledApp({
    artifactPath,
    platform: process.platform,
    architecture: process.arch,
    checkedAt: new Date().toISOString(),
    resources: await listFiles(resourcesRoot),
    publicationText: String(smoke.publicationText ?? ""),
    privatePaths: Array.isArray(smoke.privatePaths) ? smoke.privatePaths : [],
    geoLibreExternalOpened: smoke.geoLibreExternalOpened,
    serviceStopped: smoke.serviceStopped,
  });
  const output = values.get("--output") ?? "desktop-pilot-evidence.v1.json";
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  if (evidence.failures.length) process.exitCode = 1;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await main();

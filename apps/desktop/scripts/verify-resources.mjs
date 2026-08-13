import { createHash } from "node:crypto";
import { writeSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultResources = resolve(
  scriptDirectory,
  "../build/artifacts/linux-unpacked/resources",
);
const defaultManifest = resolve(
  scriptDirectory,
  "../build/resources/resource-manifest.json",
);
const contractRoots = new Set([
  "conversion",
  "credits",
  "editor",
  "service",
  "viewer",
]);

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error(
        "Usage: verify-resources.mjs [--resources <directory>] [--manifest <file>]",
      );
    }
    values.set(key.slice(2), value);
  }
  return {
    resourcesDirectory: resolve(values.get("resources") ?? defaultResources),
    expectedManifestPath: resolve(values.get("manifest") ?? defaultManifest),
  };
}

async function listContractFiles(root, directory = root) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const relativePath = relative(root, path).split(sep).join("/");
    const rootName = relativePath.split("/", 1)[0];
    if (entry.isDirectory()) {
      if (directory !== root || contractRoots.has(entry.name)) {
        files.push(...(await listContractFiles(root, path)));
      }
    } else if (
      entry.isFile() &&
      (contractRoots.has(rootName) || relativePath === "resource-manifest.json")
    ) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

async function sha256(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function verify({ resourcesDirectory, expectedManifestPath }) {
  const manifestPath = join(resourcesDirectory, "resource-manifest.json");
  const [serializedManifest, expectedManifest] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(expectedManifestPath, "utf8"),
  ]);
  if (serializedManifest !== expectedManifest) {
    throw new Error(
      "Packaged resource manifest does not match staged manifest",
    );
  }
  const manifest = JSON.parse(serializedManifest);
  if (manifest.formatVersion !== 1 || !Array.isArray(manifest.files)) {
    throw new Error("Unsupported packaged resource manifest");
  }
  const expected = [
    ...manifest.files.map((entry) => entry.path),
    "resource-manifest.json",
  ].sort();
  const actual = await listContractFiles(resourcesDirectory);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Packaged resource tree does not match manifest\nExpected: ${expected.join(", ")}\nActual: ${actual.join(", ")}`,
    );
  }
  for (const entry of manifest.files) {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      typeof entry.sha256 !== "string"
    ) {
      throw new Error("Invalid packaged resource manifest entry");
    }
    const digest = await sha256(join(resourcesDirectory, entry.path));
    if (digest !== entry.sha256) {
      throw new Error(`Resource digest mismatch: ${entry.path}`);
    }
  }
}

try {
  await verify(parseArguments(process.argv.slice(2)));
} catch (cause) {
  writeSync(
    process.stderr.fd,
    `${cause instanceof Error ? cause.message : String(cause)}\n`,
  );
  process.exitCode = 1;
}

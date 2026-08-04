import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const forbidden = ["cng-sandbox", "aboydnw/cng-sandbox"];

async function packageFiles(directory) {
  const entries = await readdir(new URL(directory, root), {
    withFileTypes: true,
  });
  const files = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    files.push(new URL(`${directory}${entry.name}/package.json`, root));
  }
  return files;
}

const manifests = [
  new URL("package.json", root),
  ...(await packageFiles("apps/")),
  ...(await packageFiles("packages/")),
];

for (const manifest of manifests) {
  const text = await readFile(manifest, "utf8");
  for (const value of forbidden) {
    if (text.toLowerCase().includes(value)) {
      throw new Error(
        `${manifest.pathname} contains forbidden upstream reference: ${value}`,
      );
    }
  }
}

try {
  await readFile(new URL(".gitmodules", root), "utf8");
  throw new Error("Git submodules are not allowed in this repository");
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "ENOENT") {
    // Expected: copied code lives in this repository.
  } else {
    throw error;
  }
}

process.stdout.write("Independent repository dependency check passed.\n");

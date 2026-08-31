import { cp, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const defaults = resolve(import.meta.dirname, "../../..");
const values = new Map();
for (let index = 0; index < process.argv.slice(2).length; index += 2) {
  const key = process.argv.slice(2)[index];
  const value = process.argv.slice(2)[index + 1];
  if (!key?.startsWith("--") || !value)
    throw new Error("Expected --name value arguments.");
  values.set(key.slice(2), value);
}

const repository = resolve(values.get("repository") ?? defaults);
const output = resolve(values.get("output") ?? join(repository, "dist/viewer"));
const licenses = [
  [
    "node_modules/@fontsource-variable/plus-jakarta-sans/LICENSE",
    "credits/PLUS_JAKARTA_SANS_LICENSE",
  ],
  ["node_modules/@fontsource/dm-mono/LICENSE", "credits/DM_MONO_LICENSE"],
];

for (const [source, destination] of licenses) {
  const destinationPath = join(output, destination);
  await mkdir(dirname(destinationPath), { recursive: true });
  await cp(join(repository, source), destinationPath);
}

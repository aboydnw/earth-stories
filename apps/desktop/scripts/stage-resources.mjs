import { createHash } from "node:crypto";
import { writeSync } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRepository = resolve(scriptDirectory, "../../..");

const resources = [
  ["apps/local-service/dist/service.js", "service/service.js"],
  ["dist/editor", "editor"],
  ["dist/viewer", "viewer"],
  ["pixi.toml", "conversion/pixi.toml"],
  ["pixi.lock", "conversion/pixi.lock"],
  ["conversion/worker", "conversion/worker"],
  ["conversion/schema", "conversion/contract"],
  ["scripts/install-pixi.mjs", "conversion/install-pixi.mjs"],
  ["LICENSE", "credits/EARTH_STORIES_LICENSE"],
  [
    "apps/desktop/resources/credits/THIRD_PARTY_NOTICES.md",
    "credits/THIRD_PARTY_NOTICES.md",
  ],
];

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error(
        `Expected --name value arguments, received: ${argv.join(" ")}`,
      );
    }
    values.set(key.slice(2), value);
  }
  const repository = resolve(values.get("repository") ?? defaultRepository);
  const output = resolve(
    values.get("output") ?? join(repository, "apps/desktop/build/resources"),
  );
  const outputParts = output.split(sep);
  if (outputParts.at(-1) !== "resources" || outputParts.at(-2) !== "build") {
    throw new Error("The staging output must end in build/resources");
  }
  return { output, repository };
}

async function assertInputs(repository) {
  for (const [source] of resources) {
    const path = join(repository, source);
    try {
      const metadata = await stat(path);
      if (!metadata.isFile() && !metadata.isDirectory()) throw new Error();
    } catch {
      throw new Error(`Missing required resource: ${source}`);
    }
  }
}

async function listFiles(root, directory = root) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Symbolic links are not allowed in staged resources: ${path}`,
      );
    }
    if (entry.isDirectory()) files.push(...(await listFiles(root, path)));
    else if (entry.isFile())
      files.push(relative(root, path).split(sep).join("/"));
  }
  return files.sort();
}

async function sha256(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function stage({ output, repository }) {
  await assertInputs(repository);
  const temporary = `${output}.tmp-${process.pid}`;
  await rm(temporary, { force: true, recursive: true });
  await mkdir(temporary, { recursive: true });
  try {
    for (const [source, destination] of resources) {
      const sourcePath = join(repository, source);
      const destinationPath = join(temporary, destination);
      const sourceMetadata = await lstat(sourcePath);
      await mkdir(dirname(destinationPath), { recursive: true });
      await cp(sourcePath, destinationPath, {
        recursive: sourceMetadata.isDirectory(),
        errorOnExist: true,
      });
    }
    const files = await listFiles(temporary);
    const manifest = {
      formatVersion: 1,
      files: await Promise.all(
        files.map(async (path) => ({
          path,
          sha256: await sha256(join(temporary, path)),
        })),
      ),
    };
    await writeFile(
      join(temporary, "resource-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await rm(output, { force: true, recursive: true });
    await mkdir(dirname(output), { recursive: true });
    await rename(temporary, output);
  } catch (cause) {
    await rm(temporary, { force: true, recursive: true });
    throw cause;
  }
}

try {
  await stage(parseArguments(process.argv.slice(2)));
} catch (cause) {
  writeSync(
    process.stderr.fd,
    `${cause instanceof Error ? cause.message : String(cause)}\n`,
  );
  process.exitCode = 1;
}

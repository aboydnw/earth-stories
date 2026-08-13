import { createHash, randomUUID } from "node:crypto";
import { writeSync } from "node:fs";
import {
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const versionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;

function parseArguments(argv) {
  const [mode, ...pairs] = argv;
  if (mode !== "generate" && mode !== "verify") {
    throw new Error(
      "Usage: release-metadata.mjs <generate|verify> --artifacts <directory> --version <version> --notices <file>",
    );
  }
  const values = new Map();
  for (let index = 0; index < pairs.length; index += 2) {
    const key = pairs[index];
    const value = pairs[index + 1];
    if (!key?.startsWith("--") || !value)
      throw new Error(
        "Release metadata arguments must use --name value pairs.",
      );
    values.set(key.slice(2), value);
  }
  const artifacts = values.get("artifacts");
  const version = values.get("version");
  const notices = values.get("notices");
  if (!artifacts || !version || !notices)
    throw new Error("Artifacts, version, and notices must be explicit.");
  if (!versionPattern.test(version))
    throw new Error(`Invalid release version: ${version}`);
  return {
    mode,
    artifactsDirectory: resolve(artifacts),
    version,
    noticesPath: resolve(notices),
  };
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function releaseNames(version) {
  return {
    manifest: `earth-stories-${version}-release-manifest.json`,
    checksums: `earth-stories-${version}-SHA256SUMS.txt`,
    notices: `earth-stories-${version}-THIRD_PARTY_NOTICES.md`,
  };
}

async function sha256(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function atomicWrite(path, contents) {
  const temporary = join(
    dirname(path),
    `.${basename(path)}-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, contents, { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function discoverArtifacts(directory, version) {
  const names = releaseNames(version);
  const ignored = new Set([...Object.values(names), "builder-debug.yml"]);
  const pattern = new RegExp(
    `^earth-stories-${escapeRegularExpression(version)}-(linux|mac|win)-(x64|x86_64|amd64|arm64|aarch64)\\.(AppImage|deb|dmg|zip|exe)$`,
  );
  const artifacts = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  )) {
    if (entry.isDirectory()) continue;
    if (!entry.isFile())
      throw new Error(`Unexpected entry in artifact directory: ${entry.name}`);
    if (ignored.has(entry.name)) continue;
    const match = pattern.exec(entry.name);
    if (!match)
      throw new Error(`Unexpected file in artifact directory: ${entry.name}`);
    const path = join(directory, entry.name);
    const metadata = await stat(path);
    if (metadata.size < 1)
      throw new Error(`Release artifact is empty: ${entry.name}`);
    artifacts.push({
      name: entry.name,
      platform: match[1],
      architecture: ["x64", "x86_64", "amd64"].includes(match[2])
        ? "x64"
        : "arm64",
      size: metadata.size,
      sha256: await sha256(path),
      signed: false,
    });
  }
  if (artifacts.length === 0) throw new Error("No release artifacts found.");
  return artifacts;
}

async function expectedRelease(options) {
  const names = releaseNames(options.version);
  const artifacts = await discoverArtifacts(
    options.artifactsDirectory,
    options.version,
  );
  const notices = await readFile(options.noticesPath);
  if (notices.length === 0) throw new Error("Third-party notices are empty.");
  const noticesDigest = createHash("sha256").update(notices).digest("hex");
  const manifest = {
    formatVersion: 1,
    version: options.version,
    releaseReady: false,
    manifestSigned: false,
    artifacts,
    thirdPartyNotices: {
      name: names.notices,
      sha256: noticesDigest,
    },
  };
  const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestDigest = createHash("sha256")
    .update(serializedManifest)
    .digest("hex");
  const checksumEntries = [
    ...artifacts.map(({ name, sha256 }) => ({ name, sha256 })),
    { name: names.notices, sha256: noticesDigest },
    { name: names.manifest, sha256: manifestDigest },
  ].sort((left, right) => left.name.localeCompare(right.name));
  const checksums = checksumEntries
    .map((entry) => `${entry.sha256}  ${entry.name}\n`)
    .join("");
  return { checksums, manifest: serializedManifest, names, notices };
}

async function generate(options) {
  const release = await expectedRelease(options);
  await Promise.all([
    atomicWrite(
      join(options.artifactsDirectory, release.names.notices),
      release.notices,
    ),
    atomicWrite(
      join(options.artifactsDirectory, release.names.manifest),
      release.manifest,
    ),
  ]);
  await atomicWrite(
    join(options.artifactsDirectory, release.names.checksums),
    release.checksums,
  );
}

async function verify(options) {
  const release = await expectedRelease(options);
  const actual = await Promise.all([
    readFile(join(options.artifactsDirectory, release.names.notices)),
    readFile(join(options.artifactsDirectory, release.names.manifest), "utf8"),
    readFile(join(options.artifactsDirectory, release.names.checksums), "utf8"),
  ]).catch(() => null);
  if (
    !actual ||
    !actual[0].equals(release.notices) ||
    actual[1] !== release.manifest ||
    actual[2] !== release.checksums
  ) {
    throw new Error("Release metadata verification failed.");
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.mode === "generate") await generate(options);
  else await verify(options);
} catch (cause) {
  writeSync(
    process.stderr.fd,
    `${cause instanceof Error ? cause.message : String(cause)}\n`,
  );
  process.exitCode = 1;
}

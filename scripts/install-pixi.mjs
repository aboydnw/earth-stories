import { createHash } from "node:crypto";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const VERSION = "0.76.1";
const RELEASE = `https://github.com/prefix-dev/pixi/releases/download/v${VERSION}`;
const TARGET = resolve(process.argv[2] ?? ".earth-stories/bin/pixi");
const artifacts = {
  "darwin-arm64": [
    "pixi-aarch64-apple-darwin.tar.gz",
    "ad059ad5dbe6de0f5cd4b0740a7f95f47c8e1270bae608c32203d1511a7af880",
  ],
  "darwin-x64": [
    "pixi-x86_64-apple-darwin.tar.gz",
    "4959ceeeb2580948445109da6b656e34f450e19566b3d9f6d28c55ce33fce6ce",
  ],
  "linux-arm64": [
    "pixi-aarch64-unknown-linux-musl.tar.gz",
    "e7c9d7f128fe02d20b212c0ba9b8ab445907b415155b72ca93f3120e63a8fbb3",
  ],
  "linux-x64": [
    "pixi-x86_64-unknown-linux-musl.tar.gz",
    "8e2ab7630f5bc1e8aa38d236842e20f565f7aa0834687e53670b7c86ba54c90f",
  ],
};

const key = `${platform()}-${arch()}`;
const artifact = artifacts[key];
if (!artifact) throw new Error(`Pixi bootstrap does not support ${key}`);

const [filename, expectedDigest] = artifact;
const response = await fetch(`${RELEASE}/${filename}`);
if (!response.ok)
  throw new Error(`Pixi download failed with HTTP ${response.status}`);
const bytes = new Uint8Array(await response.arrayBuffer());
const actualDigest = createHash("sha256").update(bytes).digest("hex");
if (actualDigest !== expectedDigest)
  throw new Error(
    `Pixi checksum mismatch: expected ${expectedDigest}, received ${actualDigest}`,
  );

const temporaryDirectory = resolve(".earth-stories/bootstrap");
const archive = join(temporaryDirectory, filename);
await mkdir(temporaryDirectory, { recursive: true });
await mkdir(dirname(TARGET), { recursive: true });
await writeFile(archive, bytes, { mode: 0o600 });
await new Promise((resolvePromise, rejectPromise) => {
  const child = spawn("tar", ["-xzf", archive, "-C", temporaryDirectory], {
    stdio: "inherit",
  });
  child.once("error", rejectPromise);
  child.once("exit", (code) =>
    code === 0
      ? resolvePromise()
      : rejectPromise(new Error(`Could not unpack Pixi (exit ${code})`)),
  );
});
await rename(join(temporaryDirectory, "pixi"), TARGET);
await chmod(TARGET, 0o755);
await rm(temporaryDirectory, { recursive: true, force: true });
process.stdout.write(`${TARGET}\n`);

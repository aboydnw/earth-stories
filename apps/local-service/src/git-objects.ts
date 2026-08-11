import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

export interface ReleaseFile {
  path: string;
  absolute: string;
}

export async function blobSha(path: string): Promise<string> {
  const { size } = await stat(path);
  const hash = createHash("sha1");
  hash.update(`blob ${size}\0`);
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function collectReleaseFiles(
  directory: string,
): Promise<ReleaseFile[]> {
  const root = resolve(directory);
  const files: ReleaseFile[] = [];

  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.name.toLowerCase() === ".git") continue;
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      files.push({
        path: relative(root, absolute).replaceAll("\\", "/"),
        absolute,
      });
    }
  }

  await walk(root);
  return files.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
}

export async function* encodeBase64Stream(
  path: string,
): AsyncGenerator<string> {
  let remainder = Buffer.alloc(0);

  for await (const chunk of createReadStream(path)) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const combined = remainder.length
      ? Buffer.concat([remainder, bytes])
      : bytes;
    const completeLength = combined.length - (combined.length % 3);
    if (completeLength > 0)
      yield combined.subarray(0, completeLength).toString("base64");
    remainder =
      completeLength < combined.length
        ? Buffer.from(combined.subarray(completeLength))
        : Buffer.alloc(0);
  }

  if (remainder.length > 0) yield remainder.toString("base64");
}

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  blobSha,
  collectReleaseFiles,
  encodeBase64Stream,
} from "./git-objects.js";

const temporaryDirectories: string[] = [];

async function fixtureDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe("blobSha", () => {
  it("matches Git's object ID for an empty blob", async () => {
    const directory = await fixtureDirectory("earth-stories-objects-");
    const path = join(directory, "empty.txt");
    await writeFile(path, "");

    expect(await blobSha(path)).toBe(
      "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
    );
  });

  it("hashes binary bytes without text conversion", async () => {
    const directory = await fixtureDirectory("earth-stories-objects-");
    const path = join(directory, "binary.bin");
    await writeFile(path, Buffer.from([0, 255, 1, 127, 128, 10]));

    expect(await blobSha(path)).toBe(
      "cc7c638ec0dbf874c3314e662ff06b403a3dd480",
    );
  });

  it("preserves CRLF bytes when hashing", async () => {
    const directory = await fixtureDirectory("earth-stories-objects-");
    const path = join(directory, "crlf.txt");
    await writeFile(path, "line one\r\nline two\r\n");

    expect(await blobSha(path)).toBe(
      "cf9b2a85b62bc2fd67c5ed43a1d0009df848ac8a",
    );
  });
});

describe("collectReleaseFiles", () => {
  it("returns sorted portable paths and excludes every .git directory", async () => {
    const directory = await fixtureDirectory("earth-stories-release-");
    await mkdir(join(directory, "nested", ".git"), { recursive: true });
    await mkdir(join(directory, ".git"), { recursive: true });
    await mkdir(join(directory, ".GIT"), { recursive: true });
    await mkdir(join(directory, "nested", ".Git"), { recursive: true });
    await writeFile(join(directory, "z-last.txt"), "z");
    await writeFile(join(directory, "nested", "b.txt"), "b");
    await writeFile(join(directory, "nested", "a.txt"), "a");
    await writeFile(join(directory, "a-first.txt"), "a");
    await writeFile(join(directory, ".git", "config"), "root secret");
    await writeFile(join(directory, "nested", ".git", "config"), "secret");
    await writeFile(join(directory, ".GIT", "config"), "case secret");
    await writeFile(join(directory, "nested", ".Git", "config"), "secret");

    expect(await collectReleaseFiles(directory)).toEqual([
      {
        path: "a-first.txt",
        absolute: join(directory, "a-first.txt"),
      },
      {
        path: "nested/a.txt",
        absolute: join(directory, "nested", "a.txt"),
      },
      {
        path: "nested/b.txt",
        absolute: join(directory, "nested", "b.txt"),
      },
      {
        path: "z-last.txt",
        absolute: join(directory, "z-last.txt"),
      },
    ]);
  });
});

describe("encodeBase64Stream", () => {
  it("matches reference base64 across multiple emitted chunks", async () => {
    const directory = await fixtureDirectory("earth-stories-base64-");
    const path = join(directory, "large.bin");
    const contents = Buffer.allocUnsafe(3 * 1024 * 1024 + 5);
    for (let index = 0; index < contents.length; index += 1)
      contents[index] = index % 251;
    await writeFile(path, contents);
    const expected = contents.toString("base64");

    const chunks: string[] = [];
    for await (const chunk of encodeBase64Stream(path)) chunks.push(chunk);

    expect(chunks.length).toBeGreaterThan(1);
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBeLessThan(
      expected.length,
    );
    expect(chunks.join("")).toBe(expected);
  });
});

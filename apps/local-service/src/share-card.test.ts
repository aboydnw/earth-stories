import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SHARE_CARD_SOURCE_FILENAME } from "@earth-stories/publisher";
import { storeShareCard } from "./share-card.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("storeShareCard", () => {
  it("atomically replaces the final card without leaving temporary files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "earth-stories-card-"));
    temporaryDirectories.push(directory);

    await storeShareCard(directory, Buffer.from("first"));
    await storeShareCard(directory, Buffer.from("second"));

    expect(
      await readFile(join(directory, SHARE_CARD_SOURCE_FILENAME), "utf8"),
    ).toBe("second");
    expect(await readdir(directory)).toEqual([SHARE_CARD_SOURCE_FILENAME]);
  });
});

import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SHARE_CARD_SOURCE_FILENAME } from "@earth-stories/publisher";

/**
 * Stores a generated share card without ever exposing a partially written
 * final file. The caller is responsible for serializing this operation with
 * publication exports for the same project.
 */
export async function storeShareCard(
  projectDirectory: string,
  card: Uint8Array,
): Promise<void> {
  const target = join(projectDirectory, SHARE_CARD_SOURCE_FILENAME);
  const temporary = join(
    projectDirectory,
    `.earth-stories-share-card-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, card);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

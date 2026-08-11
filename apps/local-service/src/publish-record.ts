import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const PUBLISH_RECORD_PATH = ".earth-stories/publish.json";

export interface PublishRecord {
  owner: string;
  repo: string;
  url: string;
  branch: string;
  buildId: string | null;
  publishedAt: string;
}

function recordPath(projectDirectory: string): string {
  return join(projectDirectory, PUBLISH_RECORD_PATH);
}

function isRecord(value: unknown): value is PublishRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.owner === "string" &&
    typeof candidate.repo === "string" &&
    typeof candidate.url === "string" &&
    typeof candidate.branch === "string" &&
    typeof candidate.publishedAt === "string"
  );
}

/**
 * Reads where this story was last published. A missing or damaged record is
 * not an error: it simply means the next publish is a first publish.
 */
export async function readPublishRecord(
  projectDirectory: string,
): Promise<PublishRecord | null> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(recordPath(projectDirectory), "utf8"),
    );
    if (!isRecord(parsed)) return null;
    return {
      owner: parsed.owner,
      repo: parsed.repo,
      url: parsed.url,
      branch: parsed.branch,
      buildId: typeof parsed.buildId === "string" ? parsed.buildId : null,
      publishedAt: parsed.publishedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Records the published location so the next publish updates the same URL
 * instead of stranding links that were already shared.
 */
export async function writePublishRecord(
  projectDirectory: string,
  record: PublishRecord,
): Promise<void> {
  const path = recordPath(projectDirectory);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`);
}

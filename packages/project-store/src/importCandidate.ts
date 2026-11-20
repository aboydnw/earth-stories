import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  storyProjectSchema,
  type StoryProject,
} from "@earth-stories/story-schema";
export interface CandidateImport {
  destinationId: string;
  jobId: string;
  digest: string;
  project: StoryProject;
  assets: { path: string; digest: string; contents: Uint8Array }[];
  brief: unknown;
}
const queues = new Map<string, Promise<unknown>>();
export async function serializeCandidate<T>(
  key: string,
  action: () => Promise<T>,
): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(action);
  queues.set(key, next);
  try {
    return await next;
  } finally {
    if (queues.get(key) === next) queues.delete(key);
  }
}
async function writeSynced(path: string, contents: string | Uint8Array) {
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(contents);
    await file.sync();
  } finally {
    await file.close();
  }
}
export async function importCandidateDirectory(
  root: string,
  input: CandidateImport,
): Promise<StoryProject> {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(input.destinationId) ||
    !input.jobId ||
    !/^[a-f0-9]{64}$/.test(input.digest)
  )
    throw new Error("Invalid candidate identity.");
  const project = storyProjectSchema.parse(input.project);
  if (project.id !== input.destinationId)
    throw new Error("Candidate destination must match the previewed project.");
  const destination = join(root, input.destinationId);
  const receipt = { jobId: input.jobId, digest: input.digest };
  const existing = await lstat(destination).catch(
    (e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") return null;
      throw e;
    },
  );
  if (existing) {
    if (!existing.isDirectory() || existing.isSymbolicLink())
      throw new Error("Candidate destination conflict.");
    const receiptPath = join(
      destination,
      ".earth-stories",
      "generation-receipt.json",
    );
    const parent = await lstat(join(destination, ".earth-stories"));
    const file = await lstat(receiptPath);
    if (parent.isSymbolicLink() || file.isSymbolicLink())
      throw new Error("Candidate receipt conflict.");
    const saved = JSON.parse(await readFile(receiptPath, "utf8"));
    if (saved.jobId !== receipt.jobId || saved.digest !== receipt.digest)
      throw new Error("Candidate destination conflict.");
    return storyProjectSchema.parse(
      JSON.parse(await readFile(join(destination, "story.json"), "utf8")),
    );
  }
  const temporary = join(root, `.candidate-${randomUUID()}`);
  await mkdir(temporary, { mode: 0o700 });
  try {
    await mkdir(join(temporary, "assets"));
    await mkdir(join(temporary, ".earth-stories"));
    let size = 0;
    const seen = new Set<string>();
    for (const asset of input.assets) {
      size += asset.contents.byteLength;
      if (
        size > 100 * 1024 * 1024 ||
        !/^assets\/[a-f0-9]{64}\.png$/.test(asset.path) ||
        createHash("sha256").update(asset.contents).digest("hex") !==
          asset.digest ||
        asset.path !== `assets/${asset.digest}.png`
      )
        throw new Error("Invalid candidate asset.");
      if (seen.has(asset.path)) continue;
      seen.add(asset.path);
      await writeSynced(join(temporary, asset.path), asset.contents);
    }
    for (const source of project.sources)
      if (source.kind !== "image" || !seen.has(source.path))
        throw new Error("Candidate has an unbound image asset.");
    await writeSynced(
      join(temporary, "story.json"),
      JSON.stringify(project, null, 2) + "\n",
    );
    await writeSynced(
      join(temporary, ".earth-stories", "generation-receipt.json"),
      JSON.stringify(receipt),
    );
    await writeSynced(
      join(temporary, ".earth-stories", "generation-brief.json"),
      JSON.stringify(input.brief),
    );
    await rename(temporary, destination);
    return project;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

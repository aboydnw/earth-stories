import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { buildPublication, verifyPublication } from "@earth-stories/publisher";
import { findExampleStory } from "../apps/local-service/src/examples.js";
import { loadExampleAssetFiles } from "../apps/local-service/src/exampleAssets.js";
import {
  assertCloudflareFiles,
  assertReviewManifest,
  requirePrivateReviewBuild,
} from "./cloudflare-review-policy.js";

const repository = resolve(import.meta.dirname, "..");
const sha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repository,
  encoding: "utf8",
}).trim();
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--pages") || args.length > 1)
  throw new Error("Usage: build-private-review.ts [--pages]");
if (args.includes("--pages")) requirePrivateReviewBuild(process.env, sha);
if (Number(process.versions.node.split(".")[0]) < 22)
  throw new Error("Node.js 22+ is required");
if (
  execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
    cwd: repository,
    encoding: "utf8",
  }).trim()
)
  throw new Error(
    "Commit or stash changes first: review output must represent an exact Git HEAD.",
  );

execFileSync(
  "corepack",
  ["yarn", "workspace", "@earth-stories/viewer-app", "build"],
  {
    cwd: repository,
    stdio: "inherit",
  },
);
const dist = join(repository, "dist");
await mkdir(dist, { recursive: true });
const temporary = await mkdtemp(join(dist, "private-review-"));
const output = join(dist, "private-review");
try {
  const project = findExampleStory("storm-track");
  if (!project)
    throw new Error("The checked-out revision has no Katrina example");
  const source = join(temporary, "project");
  await mkdir(source);
  await writeFile(join(source, "story.json"), JSON.stringify(project));
  for (const asset of await loadExampleAssetFiles(project.id)) {
    const path = join(source, asset.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, asset.contents);
  }
  const candidate = join(temporary, "publication");
  const manifest = await buildPublication({
    projectDirectory: source,
    outputDirectory: candidate,
    viewerDirectory: join(dist, "viewer"),
  });
  assertReviewManifest(manifest);
  // The manifest has no runtime dependency and only known non-DuckDB sources.
  // Keep credits and all code; remove only the unused bundled runtime directory.
  await rm(join(candidate, "runtime", "duckdb"), {
    recursive: true,
    force: true,
  });
  const verification = await verifyPublication(candidate, manifest, {
    requireEmbed: true,
    requireShareKit: true,
  });
  if (verification.status !== "passed")
    throw new Error(
      `Publication verification failed: ${verification.failures.join("; ")}`,
    );
  await writeFile(
    join(candidate, "review-build.json"),
    JSON.stringify(
      {
        commit: sha,
        example: project.id,
        publicationBuild: manifest.build.id,
        omittedUnusedRuntime: "runtime/duckdb",
        privacy:
          "Requires separately configured Cloudflare Access; this file proves no access control.",
      },
      null,
      2,
    ) + "\n",
  );
  const files = await assertCloudflareFiles(candidate);
  await rm(output, { recursive: true, force: true });
  await rename(candidate, output);
  console.log(
    `Built Katrina at ${sha}: ${files.length} files, ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes. Output: ${output}`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}

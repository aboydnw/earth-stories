import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const publishingTests = [
  "apps/local-service/src/git-objects.test.ts",
  "apps/local-service/src/pages-deploy.test.ts",
  "apps/local-service/src/pages-jobs.test.ts",
];

function environmentWithPath(path) {
  return Object.fromEntries([
    ...Object.entries(process.env).filter(
      ([name]) => name.toUpperCase() !== "PATH",
    ),
    ["PATH", path],
  ]);
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (signal) reject(new Error(`Publishing tests stopped by ${signal}.`));
      else resolve(code ?? 1);
    });
  });
}

const yarnPath = process.env.npm_execpath;
if (!yarnPath)
  throw new Error(
    "Run this verification through `yarn test:publishing:no-git` so Yarn tooling can be isolated.",
  );

const tools = await mkdtemp(join(tmpdir(), "earth-stories-no-git-"));
try {
  await symlink(process.execPath, join(tools, basename(process.execPath)));
  await symlink(yarnPath, join(tools, basename(yarnPath)));

  const availableTools = (await readdir(tools)).sort();
  console.log(
    `Running publishing tests with isolated PATH tools: ${availableTools.join(", ")}`,
  );

  const vitest = fileURLToPath(import.meta.resolve("vitest/vitest.mjs"));
  process.exitCode = await run(
    process.execPath,
    [vitest, "run", ...publishingTests],
    environmentWithPath(tools),
  );
} finally {
  await rm(tools, { force: true, recursive: true });
}

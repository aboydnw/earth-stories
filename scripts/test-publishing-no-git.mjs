import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { startVitest } from "vitest/node";

export const PUBLISHING_TESTS = [
  "apps/local-service/src/git-objects.test.ts",
  "apps/local-service/src/pages-deploy.test.ts",
  "apps/local-service/src/pages-jobs.test.ts",
];

// PATH entries must be directories. Pointing PATH at this regular file makes
// every executable-name lookup fail without creating launchers or temporary
// directories. Vitest can still run because Node is already running and its
// programmatic API does not need a node/yarn command from PATH.
export const NO_GIT_PATH = fileURLToPath(import.meta.url);

function pathEntries() {
  return Object.entries(process.env).filter(
    ([name]) => name.toUpperCase() === "PATH",
  );
}

function replacePath(path) {
  const previous = pathEntries();
  for (const [name] of previous) delete process.env[name];
  process.env.PATH = path;

  return () => {
    for (const [name] of pathEntries()) delete process.env[name];
    for (const [name, value] of previous) process.env[name] = value;
  };
}

export async function runPublishingTests(start = startVitest) {
  const restorePath = replacePath(NO_GIT_PATH);
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    console.log(
      "Running publishing tests with executable lookup disabled (no git on PATH)",
    );
    await start("test", PUBLISHING_TESTS, { run: true });
    return process.exitCode ?? 0;
  } finally {
    process.exitCode = previousExitCode;
    restorePath();
  }
}

function isMain() {
  return (
    process.argv[1] !== undefined &&
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  );
}

if (isMain()) process.exitCode = await runPublishingTests();

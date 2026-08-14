import { stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";

function pathEntries() {
  return Object.entries(process.env)
    .filter(([name]) => name.toUpperCase() === "PATH")
    .sort(([left], [right]) => left.localeCompare(right));
}

describe("no-git publishing test runner", () => {
  it("runs exactly the publishing suites with executable lookup disabled", async () => {
    const { NO_GIT_PATH, PUBLISHING_TESTS, runPublishingTests } =
      await import("./test-publishing-no-git.mjs");
    const originalPath = pathEntries();
    const originalExitCode = process.exitCode;

    const code = await runPublishingTests(async (mode, filters, options) => {
      expect(mode).toBe("test");
      expect(filters).toEqual([
        "apps/local-service/src/git-objects.test.ts",
        "apps/local-service/src/pages-deploy.test.ts",
        "apps/local-service/src/pages-jobs.test.ts",
      ]);
      expect(options).toEqual({ run: true });
      expect(pathEntries()).toEqual([["PATH", NO_GIT_PATH]]);
      expect((await stat(NO_GIT_PATH)).isFile()).toBe(true);
      process.exitCode = 23;
    });

    expect(PUBLISHING_TESTS).toHaveLength(3);
    expect(code).toBe(23);
    expect(pathEntries()).toEqual(originalPath);
    expect(process.exitCode).toBe(originalExitCode);
  });

  it("restores PATH and the caller's exit code when Vitest rejects", async () => {
    const { runPublishingTests } = await import("./test-publishing-no-git.mjs");
    const originalPath = pathEntries();
    const originalExitCode = process.exitCode;

    await expect(
      runPublishingTests(async () => {
        process.exitCode = 19;
        throw new Error("setup failed");
      }),
    ).rejects.toThrow("setup failed");

    expect(pathEntries()).toEqual(originalPath);
    expect(process.exitCode).toBe(originalExitCode);
  });
});

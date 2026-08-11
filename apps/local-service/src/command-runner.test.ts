import { describe, expect, it } from "vitest";
import { redact, runCommand } from "./command-runner.js";

const node = process.execPath;

describe("redact", () => {
  it("replaces secrets and credentials embedded in remote URLs", () => {
    expect(redact("pushed with ghp_secret", ["ghp_secret"])).toBe(
      "pushed with [redacted]",
    );
    expect(
      redact("https://x-access-token:ghp_secret@github.com/owner/repo.git"),
    ).toBe("https://[redacted]@github.com/owner/repo.git");
  });

  it("leaves ordinary text untouched", () => {
    expect(redact("https://owner.github.io/repo/", ["ghp_secret"])).toBe(
      "https://owner.github.io/repo/",
    );
  });
});

describe("runCommand", () => {
  it("returns buffered stdout and stderr on success", async () => {
    const result = await runCommand({
      executable: node,
      args: ["-e", "process.stdout.write('out'); process.stderr.write('warn')"],
    });
    expect(result.stdout).toBe("out");
    expect(result.stderr).toBe("warn");
  });

  it("puts stderr in the error when the command exits non-zero", async () => {
    await expect(
      runCommand({
        executable: node,
        args: [
          "-e",
          "process.stderr.write('fatal: repo not found'); process.exit(3)",
        ],
      }),
    ).rejects.toThrow(/fatal: repo not found/);
  });

  it("reports a missing executable instead of hanging", async () => {
    await expect(
      runCommand({
        executable: "earth-stories-not-a-real-executable",
        args: [],
      }),
    ).rejects.toThrow(/could not be started/);
  });

  it("keeps secrets out of failure messages", async () => {
    await expect(
      runCommand({
        executable: node,
        args: [
          "-e",
          "process.stderr.write('denied for ghp_secret'); process.exit(1)",
        ],
        secrets: ["ghp_secret"],
      }),
    ).rejects.toThrow(/\[redacted\]/);
  });

  it("runs in the requested working directory", async () => {
    const result = await runCommand({
      executable: node,
      args: ["-e", "process.stdout.write(process.cwd())"],
      cwd: process.cwd(),
    });
    expect(result.stdout).toBe(process.cwd());
  });
});

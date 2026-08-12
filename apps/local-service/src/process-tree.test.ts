import { describe, expect, it, vi } from "vitest";
import { ProcessTreeRunner, terminateProcessTree } from "./process-tree.js";

describe("terminateProcessTree", () => {
  it("kills the whole POSIX process group", async () => {
    const kill = vi.fn();

    await terminateProcessTree(4321, { platform: "linux", kill });

    expect(kill).toHaveBeenCalledWith(-4321, "SIGKILL");
  });

  it("uses taskkill tree termination on Windows", async () => {
    const taskkill = vi.fn(async () => undefined);

    await terminateProcessTree(4321, { platform: "win32", taskkill });

    expect(taskkill).toHaveBeenCalledWith(4321);
  });
});

describe.skipIf(process.platform === "win32")("ProcessTreeRunner", () => {
  it("owns a detached process group and force-terminates it", async () => {
    const runner = new ProcessTreeRunner();
    const running = runner.run({
      executable: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      cwd: process.cwd(),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(runner.activeCount()).toBe(1);
    await runner.forceTerminate();
    await expect(running).rejects.toThrow();
    expect(runner.activeCount()).toBe(0);
  });
});

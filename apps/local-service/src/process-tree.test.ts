import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { ProcessTreeRunner, terminateProcessTree } from "./process-tree.js";

function controlledProcess(pid: number) {
  return Object.assign(new EventEmitter(), {
    pid,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  }) as unknown as ChildProcessWithoutNullStreams;
}

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

describe("ProcessTreeRunner termination boundary", () => {
  it("rejects a pre-aborted command without spawning", async () => {
    const spawnProcess = vi.fn();
    const runner = new ProcessTreeRunner({
      spawn: spawnProcess,
      platform: "linux",
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      runner.run({
        executable: "unused",
        args: [],
        cwd: process.cwd(),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(spawnProcess).not.toHaveBeenCalled();
    expect(runner.activeCount()).toBe(0);
  });

  it("permanently rejects commands begun after force termination", async () => {
    const spawnProcess = vi.fn();
    const runner = new ProcessTreeRunner({
      spawn: spawnProcess,
      platform: "linux",
    });
    await runner.forceTerminate();

    await expect(
      runner.run({ executable: "unused", args: [], cwd: process.cwd() }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("does not let a command enter while forced cleanup is waiting", async () => {
    const child = controlledProcess(4321);
    const spawnProcess = vi.fn(() => child);
    const kill = vi.fn(() => true) as unknown as typeof process.kill;
    const runner = new ProcessTreeRunner({
      spawn: spawnProcess,
      platform: "linux",
      kill,
    });
    const running = runner.run({
      executable: "injected",
      args: [],
      cwd: process.cwd(),
    });
    void running.catch(() => undefined);
    expect(spawnProcess).toHaveBeenCalledOnce();

    const terminating = runner.forceTerminate();
    await expect(
      runner.run({ executable: "late", args: [], cwd: process.cwd() }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(spawnProcess).toHaveBeenCalledOnce();

    child.emit("exit", null);
    await terminating;
    await expect(running).rejects.toThrow();
    expect(runner.activeCount()).toBe(0);
  });

  it("shares one cleanup across concurrent force-termination calls", async () => {
    const child = controlledProcess(9876);
    const spawnProcess = vi.fn(() => child);
    const kill = vi.fn(() => true) as unknown as typeof process.kill;
    const runner = new ProcessTreeRunner({
      spawn: spawnProcess,
      platform: "linux",
      kill,
    });
    const running = runner.run({
      executable: "injected",
      args: [],
      cwd: process.cwd(),
    });
    void running.catch(() => undefined);
    expect(spawnProcess).toHaveBeenCalledOnce();

    const first = runner.forceTerminate();
    const second = runner.forceTerminate();

    expect(second).toBe(first);
    expect(kill).toHaveBeenCalledTimes(1);
    child.emit("exit", null);
    await first;
    expect(runner.activeCount()).toBe(0);
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

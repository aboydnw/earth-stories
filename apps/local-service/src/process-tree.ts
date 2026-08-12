import { spawn } from "node:child_process";

export interface ProcessTreeCommand {
  executable: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  input?: string;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  signal?: AbortSignal;
}

async function taskkill(pid: number): Promise<void> {
  await new Promise<void>((resolveTaskkill, rejectTaskkill) => {
    const child = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    child.once("error", rejectTaskkill);
    child.once("close", (code) =>
      code === 0
        ? resolveTaskkill()
        : rejectTaskkill(new Error(`taskkill exited with ${code}`)),
    );
  });
}

export async function terminateProcessTree(
  pid: number,
  dependencies: {
    platform?: NodeJS.Platform;
    kill?: typeof process.kill;
    taskkill?: (pid: number) => Promise<void>;
  } = {},
): Promise<void> {
  if ((dependencies.platform ?? process.platform) === "win32")
    await (dependencies.taskkill ?? taskkill)(pid);
  else (dependencies.kill ?? process.kill)(-pid, "SIGKILL");
}

export class ProcessTreeRunner {
  readonly #active = new Map<number, Promise<void>>();

  activeCount(): number {
    return this.#active.size;
  }

  run(command: ProcessTreeCommand): Promise<void> {
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd,
      env: command.env ? { ...process.env, ...command.env } : process.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    const pid = child.pid;
    const onAbort = () => {
      if (!pid) return;
      if (process.platform === "win32") child.kill("SIGTERM");
      else {
        try {
          process.kill(-pid, "SIGTERM");
        } catch {
          // The process tree may have completed between cancellation and kill.
        }
      }
    };
    command.signal?.addEventListener("abort", onAbort, { once: true });
    const running = new Promise<void>((resolveCommand, rejectCommand) => {
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      if (command.onStdout) child.stdout.on("data", command.onStdout);
      if (command.onStderr) child.stderr.on("data", command.onStderr);
      child.once("error", rejectCommand);
      child.once("exit", (code) =>
        code === 0
          ? resolveCommand()
          : rejectCommand(new Error(`Conversion process exited with ${code}`)),
      );
      child.stdin.end(command.input ?? "");
    }).finally(() => {
      command.signal?.removeEventListener("abort", onAbort);
      if (pid) this.#active.delete(pid);
    });
    if (pid) this.#active.set(pid, running);
    return running;
  }

  async forceTerminate(): Promise<void> {
    const active = [...this.#active.entries()];
    await Promise.all(
      active.map(([pid]) => terminateProcessTree(pid).catch(() => undefined)),
    );
    await Promise.allSettled(active.map(([, running]) => running));
  }
}

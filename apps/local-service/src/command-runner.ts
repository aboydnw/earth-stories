import { spawn } from "node:child_process";

export interface Command {
  executable: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  secrets?: string[];
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: Command) => Promise<CommandResult>;

/**
 * Replaces every secret with a placeholder. Command output and failure
 * messages reach job events and the editor, so an access token embedded in a
 * git remote must never survive into them.
 */
export function redact(value: string, secrets: string[] = []): string {
  return secrets
    .filter(Boolean)
    .reduce(
      (text, secret) => text.replaceAll(secret, "[redacted]"),
      value.replace(/(https?:\/\/)[^/@\s]+@/gi, "$1[redacted]@"),
    );
}

/**
 * Runs a command to completion, buffering both streams. Unlike the conversion
 * runtime's runner this keeps stderr and puts it in the thrown error, because
 * git and GitHub failures explain themselves only there.
 */
export const runCommand: CommandRunner = (command) =>
  new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd,
      env: command.env ? { ...process.env, ...command.env } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.once("error", (cause) =>
      rejectCommand(
        new Error(
          `${command.executable} could not be started: ${redact(cause.message, command.secrets)}`,
        ),
      ),
    );
    child.once("close", (code) => {
      if (code === 0) {
        resolveCommand({
          stdout: redact(stdout, command.secrets),
          stderr: redact(stderr, command.secrets),
        });
        return;
      }
      const detail = redact(stderr.trim() || stdout.trim(), command.secrets);
      rejectCommand(
        new Error(
          `${command.executable} ${command.args[0] ?? ""} failed${detail ? `: ${detail}` : ` with exit code ${code}`}`,
        ),
      );
    });
  });

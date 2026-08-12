import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import {
  CONVERSION_PROTOCOL_VERSION,
  conversionJobEventSchema,
  conversionJobRequestSchema,
  type ConversionCapability,
  type ConversionJobEvent,
  type ConversionJobRequest,
} from "@earth-stories/story-schema";

export const CAPABILITY_DOWNLOAD_ESTIMATES: Record<
  ConversionCapability,
  number
> = {
  core: 45_000_000,
  vector: 430_000_000,
  raster: 360_000_000,
  multidim: 410_000_000,
  pointcloud: 310_000_000,
};

export interface RuntimeCommand {
  executable: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  input?: string;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export type RuntimeCommandRunner = (command: RuntimeCommand) => Promise<void>;

const runCommand: RuntimeCommandRunner = (command) =>
  new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd,
      env: command.env ? { ...process.env, ...command.env } : process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
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
  });

export class ConversionRuntime {
  readonly #pixi: string;
  readonly #manifestDirectory: string;
  readonly #workerDirectory: string;
  readonly #environment: Record<string, string> | undefined;
  readonly #run: RuntimeCommandRunner;
  readonly #ensureExecutable: () => Promise<void>;
  readonly #ready = new Set<ConversionCapability>();

  constructor(options: {
    pixi: string;
    manifestDirectory: string;
    workerDirectory: string;
    pixiHome: string | null;
    run?: RuntimeCommandRunner;
    bootstrap: (pixiExecutable: string) => Promise<void>;
    executableExists?: (path: string) => Promise<boolean>;
  }) {
    this.#pixi = options.pixi;
    this.#manifestDirectory = options.manifestDirectory;
    this.#workerDirectory = options.workerDirectory;
    this.#environment = options.pixiHome
      ? { PIXI_HOME: options.pixiHome }
      : undefined;
    this.#run = options.run ?? runCommand;
    const executableExists =
      options.executableExists ??
      (async (path: string) => {
        try {
          await access(path);
          return true;
        } catch {
          return false;
        }
      });
    this.#ensureExecutable = async () => {
      if (!(await executableExists(this.#pixi)))
        await options.bootstrap(this.#pixi);
    };
  }

  async provision(
    capability: ConversionCapability,
    requestId: string,
    onEvent: (event: ConversionJobEvent) => void,
  ): Promise<void> {
    if (this.#ready.has(capability)) return;
    await this.#ensureExecutable();
    const total = CAPABILITY_DOWNLOAD_ESTIMATES[capability];
    onEvent({
      protocol: CONVERSION_PROTOCOL_VERSION,
      requestId,
      type: "progress",
      stage: "provisioning",
      completed: 0,
      total,
      unit: "bytes",
      message: `Downloading the ${capability} data tools (up to ${Math.ceil(total / 1_000_000)} MB)`,
    });
    await this.#run({
      executable: this.#pixi,
      cwd: this.#manifestDirectory,
      env: this.#environment,
      args: [
        "install",
        "--manifest-path",
        join(this.#manifestDirectory, "pixi.toml"),
        "-e",
        capability,
      ],
    });
    this.#ready.add(capability);
    onEvent({
      protocol: CONVERSION_PROTOCOL_VERSION,
      requestId,
      type: "progress",
      stage: "provisioning",
      completed: total,
      total,
      unit: "bytes",
      message: `${capability} data tools are ready`,
    });
  }

  async execute(
    input: unknown,
    onEvent: (event: ConversionJobEvent) => void,
  ): Promise<void> {
    const request: ConversionJobRequest =
      conversionJobRequestSchema.parse(input);
    await this.provision(request.capability, request.requestId, onEvent);
    let buffered = "";
    let parseFailure: unknown;
    await this.#run({
      executable: this.#pixi,
      cwd: this.#manifestDirectory,
      env: this.#environment,
      args: [
        "run",
        "--manifest-path",
        join(this.#manifestDirectory, "pixi.toml"),
        "-e",
        request.capability,
        "python",
        join(this.#workerDirectory, "worker.py"),
      ],
      input: `${JSON.stringify(request)}\n`,
      onStdout: (chunk) => {
        if (parseFailure) return;
        buffered += chunk;
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        try {
          for (const line of lines) {
            if (line.trim())
              onEvent(conversionJobEventSchema.parse(JSON.parse(line)));
          }
        } catch (cause) {
          parseFailure = cause;
        }
      },
    });
    if (parseFailure) throw parseFailure;
    if (buffered.trim()) {
      try {
        onEvent(conversionJobEventSchema.parse(JSON.parse(buffered)));
      } catch (cause) {
        throw new Error("The conversion worker returned an invalid event.", {
          cause,
        });
      }
    }
  }
}

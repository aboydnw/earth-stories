import { getConversionJob, type ConversionJobSnapshot } from "./api";
import { isMissingJobError } from "./httpErrors";

const WORKSPACE_CHANGE_MESSAGE =
  "This conversion ended when the workspace changed.";

export async function pollConversionJob(
  initial: ConversionJobSnapshot,
  options: {
    load?(id: string): Promise<ConversionJobSnapshot>;
    wait?(): Promise<void>;
    now?(): number;
    deadline?: number;
    onUpdate?(job: ConversionJobSnapshot): void;
  } = {},
): Promise<
  | { kind: "completed"; job: ConversionJobSnapshot }
  | { kind: "workspace-changed"; message: string }
> {
  const load = options.load ?? getConversionJob;
  const wait =
    options.wait ??
    (() => new Promise<void>((resolve) => setTimeout(resolve, 750)));
  const now = options.now ?? Date.now;
  const deadline = options.deadline ?? now() + 30 * 60 * 1_000;
  let job = initial;

  while (job.status === "queued" || job.status === "running") {
    if (now() >= deadline)
      throw new Error(
        "The conversion is still running. Try preparing this source again later.",
      );
    await wait();
    try {
      job = await load(job.id);
    } catch (cause) {
      if (isMissingJobError(cause))
        return { kind: "workspace-changed", message: WORKSPACE_CHANGE_MESSAGE };
      throw cause;
    }
    options.onUpdate?.(job);
  }

  return { kind: "completed", job };
}

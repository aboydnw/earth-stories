import { describe, expect, it, vi } from "vitest";
import type { ConversionJobSnapshot } from "./api";
import { pollConversionJob } from "./conversionPolling";

const running: ConversionJobSnapshot = {
  id: "conversion-one",
  projectId: "project-one",
  status: "running",
  events: [],
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
};

const awaitingApproval: ConversionJobSnapshot = {
  ...running,
  status: "awaiting-approval",
};

describe("pollConversionJob", () => {
  it("returns an approval-pending result that callers can resume", async () => {
    await expect(pollConversionJob(awaitingApproval)).resolves.toEqual({
      kind: "approval-pending",
      job: awaitingApproval,
    });
  });

  it("ends normally with workspace-change guidance when the job is missing", async () => {
    const load = vi.fn(async () => {
      throw Object.assign(new Error("Job not found"), { status: 404 });
    });

    await expect(
      pollConversionJob(running, {
        load,
        wait: async () => undefined,
        now: () => 0,
        deadline: 100,
      }),
    ).resolves.toEqual({
      kind: "workspace-changed",
      message: "This conversion ended when the workspace changed.",
    });
    expect(load).toHaveBeenCalledOnce();
  });

  it("preserves non-404 polling failures", async () => {
    const failure = new Error("service unavailable");

    await expect(
      pollConversionJob(running, {
        load: async () => {
          throw failure;
        },
        wait: async () => undefined,
        now: () => 0,
        deadline: 100,
      }),
    ).rejects.toBe(failure);
  });
});

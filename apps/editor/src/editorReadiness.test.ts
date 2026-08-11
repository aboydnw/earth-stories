import { describe, expect, it } from "vitest";
import type {
  AuthoringReadiness,
  ReadinessFinding,
} from "@earth-stories/publisher/readiness";
import { nextGuidanceAction, workflowStages } from "./editorReadiness";
import type { PublicationReadinessState } from "./usePublicationReadiness";

const manifest = {} as AuthoringReadiness["manifest"] & object;
const idle: PublicationReadinessState = {
  status: "idle",
  result: null,
  error: null,
  key: null,
};

function readiness(
  findings: ReadinessFinding[] = [],
  compiled = true,
): AuthoringReadiness {
  return {
    manifest: compiled ? manifest : null,
    findings,
    stages: {
      story: "complete",
      chapters: "complete",
      data: "optional",
      preview: compiled ? "complete" : "blocked",
      publish: findings.some(({ severity }) => severity === "error")
        ? "blocked"
        : "current",
      sharing: findings.some(({ severity }) => severity === "error")
        ? "blocked"
        : "current",
    },
  };
}

function action(
  overrides: Partial<Parameters<typeof nextGuidanceAction>[0]> = {},
) {
  return nextGuidanceAction({
    readiness: readiness(),
    activeChapterId: "chapter-1",
    saveState: "saved",
    previewReviewed: true,
    preflight: idle,
    ...overrides,
  });
}

describe("editor readiness guidance", () => {
  it("applies the deterministic precedence", () => {
    expect(action({ saveState: "save-error" }).id).toBe("save-failure");
    expect(
      action({
        readiness: readiness([
          { id: "title", area: "story", severity: "error", message: "Title" },
        ]),
      }).destination,
    ).toBe("story");
    expect(
      action({
        readiness: readiness([
          {
            id: "chapter",
            area: "chapters",
            severity: "error",
            chapterId: "chapter-1",
            message: "Chapter",
          },
        ]),
      }).destination,
    ).toBe("chapters");
    expect(
      action({
        readiness: readiness([
          { id: "data", area: "data", severity: "error", message: "Data" },
        ]),
      }).destination,
    ).toBe("data");
    expect(action({ readiness: readiness([], false) }).id).toBe(
      "preview-unavailable",
    );
    expect(action({ previewReviewed: false }).id).toBe("preview-review");
  });

  it("routes stale server results and warnings to review instead of Ready", () => {
    expect(
      action({
        preflight: {
          ...idle,
          status: "stale",
          result: {
            ready: true,
            issues: [],
            projectId: "p",
            buildId: "b",
            estimatedIncludedBytes: 0,
            includedAssets: 0,
            connectedAssets: 0,
            profile: "connected",
          },
        },
      }).id,
    ).toBe("publish");
    expect(
      action({
        readiness: readiness([
          {
            id: "warning",
            area: "publish",
            severity: "warning",
            message: "Review",
          },
        ]),
      }).id,
    ).toBe("warning");
  });

  it("projects preview receipts and current server checks into stage states", () => {
    expect(workflowStages(readiness(), { previewReviewed: false })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "preview", state: "current" }),
        expect.objectContaining({ id: "publish", state: "blocked" }),
      ]),
    );
    expect(
      workflowStages(readiness(), {
        previewReviewed: true,
        preflight: {
          ...idle,
          status: "ready",
          result: {
            ready: true,
            issues: [],
            projectId: "p",
            buildId: "b",
            estimatedIncludedBytes: 0,
            includedAssets: 0,
            connectedAssets: 0,
            profile: "connected",
          },
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "publish",
          state: "complete",
          description: "Ready",
        }),
      ]),
    );
  });

  it("keeps sharing findings inside Publish instead of adding a workflow stage", () => {
    const stages = workflowStages(readiness(), {
      previewReviewed: true,
      preflight: {
        ...idle,
        status: "ready",
        result: {
          ready: true,
          issues: [
            {
              id: "share-card",
              area: "sharing",
              severity: "warning",
              message: "This story has no usable link preview image.",
            },
          ],
          projectId: "p",
          buildId: "b",
          estimatedIncludedBytes: 0,
          includedAssets: 0,
          connectedAssets: 0,
          profile: "connected",
        },
      },
    });
    expect(stages.map(({ id }) => id)).toEqual([
      "story",
      "chapters",
      "data",
      "preview",
      "publish",
    ]);
    expect(stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "publish",
          state: "complete",
          description: "Ready",
        }),
      ]),
    );
  });

  it("routes current server blockers before warnings and publish", () => {
    expect(
      action({
        preflight: {
          ...idle,
          status: "ready",
          result: {
            ready: false,
            issues: [
              {
                id: "remote",
                area: "publish",
                severity: "error",
                message: "Remote source unavailable",
              },
            ],
            projectId: "p",
            buildId: null,
            estimatedIncludedBytes: 0,
            includedAssets: 0,
            connectedAssets: 0,
            profile: "connected",
          },
        },
      }).id,
    ).toBe("remote");
    expect(action().id).toBe("publish");
  });

  it("returns exactly one primary action for prose-only and unsaved states", () => {
    const result = action({ saveState: "changed", previewReviewed: true });
    expect(result).toEqual(
      expect.objectContaining({ id: "preview-review", destination: "preview" }),
    );
    expect(Array.isArray(result)).toBe(false);
  });
});

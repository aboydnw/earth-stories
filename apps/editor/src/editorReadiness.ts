import type {
  AuthoringReadiness,
  ReadinessArea,
} from "@earth-stories/publisher/readiness";
import type { WorkflowStage } from "@earth-stories/ui";
import type { PublicationReadinessState } from "./usePublicationReadiness";

export type GuidanceDestination = "save" | ReadinessArea;
export interface GuidanceAction {
  id: string;
  label: string;
  message: string;
  destination: GuidanceDestination;
  tone: "neutral" | "warning" | "danger";
  chapterId?: string;
}

type WorkflowArea = Exclude<ReadinessArea, "sharing">;

const labels: Record<WorkflowArea, string> = {
  story: "Story",
  chapters: "Chapters",
  data: "Data",
  preview: "Preview",
  publish: "Publish",
};

const workflowOrder: WorkflowArea[] = [
  "story",
  "chapters",
  "data",
  "preview",
  "publish",
];

export function workflowStages(
  readiness: AuthoringReadiness,
  options: {
    previewReviewed?: boolean;
    preflight?: PublicationReadinessState;
  } = {},
): WorkflowStage[] {
  const states = { ...readiness.stages };
  const descriptions: Partial<Record<ReadinessArea, string>> = {};
  if (readiness.manifest && !options.previewReviewed) {
    states.preview = "current";
    states.publish = "blocked";
    descriptions.preview = "Review again";
  } else if (readiness.manifest) {
    const serverFindings =
      options.preflight?.status === "ready"
        ? options.preflight.result?.issues
        : null;
    if (!serverFindings) {
      states.publish = "current";
      descriptions.publish = "Checks required";
    } else {
      const publishFindings = serverFindings.filter(
        ({ area }) => area !== "sharing",
      );
      if (publishFindings.some(({ severity }) => severity === "error")) {
        states.publish = "blocked";
      } else {
        if (publishFindings.some(({ severity }) => severity === "warning")) {
          states.publish = "current";
          descriptions.publish = "Needs review";
        } else {
          states.publish = "complete";
          descriptions.publish = "Ready";
        }
      }
    }
  }
  return workflowOrder.map((id) => ({
    id,
    label: labels[id],
    state: states[id],
    description: descriptions[id],
  }));
}

export function nextGuidanceAction(input: {
  readiness: AuthoringReadiness;
  activeChapterId: string | null;
  saveState: "saved" | "changed" | "saving" | "save-error" | "exporting";
  previewReviewed: boolean;
  preflight: PublicationReadinessState;
}): GuidanceAction {
  const { readiness, activeChapterId, saveState, previewReviewed, preflight } =
    input;
  if (saveState === "save-error")
    return {
      id: "save-failure",
      label: "Try saving again",
      message: "Your latest changes are not saved on this computer.",
      destination: "save",
      tone: "danger",
    };
  const storyBlocker = readiness.findings.find(
    ({ area, severity }) => area === "story" && severity === "error",
  );
  if (storyBlocker)
    return {
      id: storyBlocker.id,
      label: "Complete story details",
      message: storyBlocker.message,
      destination: "story",
      tone: "danger",
    };
  const activeBlocker = readiness.findings.find(
    ({ area, severity, chapterId }) =>
      area === "chapters" &&
      severity === "error" &&
      chapterId === activeChapterId,
  );
  if (activeBlocker)
    return {
      id: activeBlocker.id,
      label: "Fix this chapter",
      message: activeBlocker.message,
      destination: "chapters",
      chapterId: activeBlocker.chapterId,
      tone: "danger",
    };
  const dataBlocker = readiness.findings.find(
    ({ area, severity }) => area === "data" && severity === "error",
  );
  if (dataBlocker)
    return {
      id: dataBlocker.id,
      label: "Resolve story data",
      message: dataBlocker.message,
      destination: "data",
      chapterId: dataBlocker.chapterId,
      tone: "danger",
    };
  if (!readiness.manifest)
    return {
      id: "preview-unavailable",
      label: "Review chapters",
      message: "The reader preview is not available yet.",
      destination: "chapters",
      tone: "danger",
    };
  if (!previewReviewed || saveState === "changed")
    return {
      id: "preview-review",
      label: "See as a reader",
      message: "Review the latest saved revision before publishing publicly.",
      destination: "preview",
      tone: "neutral",
    };
  const serverBlocker =
    preflight.status === "ready"
      ? preflight.result?.issues.find(({ severity }) => severity === "error")
      : null;
  if (serverBlocker)
    return {
      id: serverBlocker.id,
      label: "Review publication blockers",
      message: serverBlocker.message,
      destination: "publish",
      tone: "danger",
    };
  const warning = (
    preflight.status === "ready" ? preflight.result?.issues : readiness.findings
  )?.find(({ severity }) => severity === "warning");
  if (warning)
    return {
      id: warning.id,
      label: "Review warnings",
      message: warning.message,
      destination: "publish",
      tone: "warning",
    };
  return {
    id: "publish",
    label: "Publish publicly",
    message: "This saved revision is ready for publication checks.",
    destination: "publish",
    tone: "neutral",
  };
}

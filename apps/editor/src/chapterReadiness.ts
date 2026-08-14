import {
  referencedSourceIds,
  type ReadinessFinding,
} from "@earth-stories/publisher/readiness";
import type { ProjectChapter, StoryProject } from "@earth-stories/story-schema";
import { rankReadinessFindings } from "./readinessPriority";

export interface ChapterReadinessState {
  tone: "ready" | "warning" | "error";
  label: string;
  findings: ReadinessFinding[];
}

export function deriveChapterReadiness(
  project: StoryProject,
  findings: ReadinessFinding[],
): Record<string, ChapterReadinessState> {
  return Object.fromEntries(
    project.chapters.map((chapter) => {
      const sourceIds = referencedSources(chapter);
      const relevant = rankReadinessFindings(
        findings.filter(
          (finding) =>
            finding.chapterId === chapter.id ||
            (!finding.chapterId &&
              Boolean(
                finding.resourceId && sourceIds.includes(finding.resourceId),
              )),
        ),
      );
      const primary = relevant[0];
      return [
        chapter.id,
        primary
          ? {
              tone: primary.severity === "error" ? "error" : "warning",
              label: findingLabel(primary, chapter),
              findings: relevant,
            }
          : { tone: "ready", label: "Ready", findings: [] },
      ];
    }),
  );
}

export function referencedSources(chapter: ProjectChapter) {
  return referencedSourceIds(chapter);
}

function findingLabel(finding: ReadinessFinding, chapter: ProjectChapter) {
  if (finding.id.startsWith("chapter-title-")) return "Add title";
  if (finding.id.startsWith("chapter-narrative-")) return "Add reader text";
  if (finding.id.startsWith("image-alt-")) return "Add alternative text";
  if (finding.id.startsWith("chapter-fields-")) {
    if (chapter.type === "chart") return "Configure chart axes";
    if (chapter.type === "video") return "Add video URL";
    if (chapter.type === "flyover") return "Add map views";
    return "Complete chapter";
  }
  if (
    finding.id.startsWith("chapter-source-kind-") ||
    finding.id.startsWith("chapter-overlay-kind-")
  )
    return "Choose compatible data";
  if (finding.id.startsWith("source-publication-"))
    return "Fix source settings";
  if (finding.area === "data") return "Choose data";
  if (finding.id.startsWith("provenance-")) return "Review source details";
  return finding.severity === "error" ? "Needs attention" : "Review chapter";
}

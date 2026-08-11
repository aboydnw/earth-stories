import type { ReadinessFinding } from "@earth-stories/publisher/readiness";

export function readinessFindingPriority(finding: ReadinessFinding) {
  if (
    finding.area === "data" ||
    finding.id.startsWith("chapter-source-") ||
    finding.id.startsWith("source-publication-")
  )
    return 0;
  if (finding.id.startsWith("chapter-fields-")) return 1;
  if (finding.id.startsWith("chapter-title-")) return 2;
  if (finding.id.startsWith("chapter-narrative-")) return 3;
  if (finding.id.startsWith("image-alt-")) return 4;
  return 5;
}

export function rankReadinessFindings(findings: ReadinessFinding[]) {
  return [...findings].sort((left, right) => {
    const severity = severityRank(left.severity) - severityRank(right.severity);
    return (
      severity ||
      readinessFindingPriority(left) - readinessFindingPriority(right)
    );
  });
}

function severityRank(severity: ReadinessFinding["severity"]) {
  return severity === "error" ? 0 : severity === "warning" ? 1 : 2;
}

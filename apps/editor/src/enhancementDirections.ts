import type { StoryBrief } from "@earth-stories/story-schema";
export function enhancementDirections(
  brief: Pick<StoryBrief, "narrative" | "visualDirection">,
): string {
  return [brief.narrative.trim(), brief.visualDirection.trim()]
    .filter(Boolean)
    .join("\n\n");
}

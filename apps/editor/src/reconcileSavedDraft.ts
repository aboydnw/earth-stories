import type { StoryProject } from "@earth-stories/story-schema";

/** Carry the persisted revision forward without replacing newer author edits. */
export function reconcileSavedDraft(
  current: StoryProject | null,
  submitted: StoryProject,
  saved: StoryProject,
): StoryProject | null {
  if (!current || current.id !== submitted.id) return current;
  if (current === submitted) return saved;
  if (current.metadata.updated !== submitted.metadata.updated) return current;
  return {
    ...current,
    metadata: { ...current.metadata, updated: saved.metadata.updated },
  };
}

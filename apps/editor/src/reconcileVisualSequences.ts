import {
  sceneFrame,
  VISUAL_PROGRESS_EPSILON,
  type ProjectChapter,
  type VisualSequence,
} from "@earth-stories/story-schema";
/** Keep editing independent of artwork: split continuity at inserted/moved/media chapters. */
export function reconcileVisualSequences(
  chapters: ProjectChapter[],
  sequences: VisualSequence[],
): VisualSequence[] {
  const usedIds = new Set(sequences.map((s) => s.id));
  return sequences.flatMap((sequence) => {
    const runs: (typeof sequence.steps)[] = [];
    for (const step of sequence.steps) {
      const index = chapters.findIndex((c) => c.id === step.chapterId);
      if (
        index < 0 ||
        !["prose", "illustrated"].includes(chapters[index]!.type)
      )
        continue;
      const run = runs.at(-1),
        previous = run?.at(-1);
      if (
        previous &&
        chapters.findIndex((c) => c.id === previous.chapterId) === index - 1 &&
        Math.abs(previous.end - step.start) <= VISUAL_PROGRESS_EPSILON
      )
        run!.push(step);
      else runs.push([step]);
    }
    if (runs.length === 1 && runs[0]!.length === sequence.steps.length)
      return [sequence];
    const samples = new Map<number, ReturnType<typeof sceneFrame>>();
    const sample = (at: number) => {
      if (!samples.has(at)) samples.set(at, sceneFrame(sequence.scene, at));
      return samples.get(at)!;
    };
    return runs.map((steps, i) => {
      const start = steps[0]!.start,
        end = steps.at(-1)!.end,
        span = end - start;
      let id = `${sequence.id.slice(0, 60)}-part-${i}`,
        suffix = 0;
      while (usedIds.has(id))
        id = `${sequence.id.slice(0, 52)}-part-${i}-${++suffix}`;
      usedIds.add(id);
      return {
        ...sequence,
        id,
        steps: steps.map((step) => ({
          ...step,
          start: (step.start - start) / span,
          end: (step.end - start) / span,
        })),
        scene: {
          ...sequence.scene,
          // Bake the displayed blend before trimming its original resting frame.
          motionStrength: 1,
          staticProgress: Math.max(
            0,
            Math.min(1, (sequence.scene.staticProgress - start) / span),
          ),
          layers: sequence.scene.layers.map((layer, j) => {
            const keyframe = (at: number) => {
              const { id: _id, ...frame } = sample(at)[j]!;
              return {
                ...frame,
                // sceneFrame applies layer opacity; tracks must not apply it twice.
                opacity: layer.opacity
                  ? Math.min(1, Math.max(0, frame.opacity / layer.opacity))
                  : 0,
                at: (at - start) / span,
              };
            };
            return {
              ...layer,
              keyframes: layer.keyframes.length
                ? [
                    keyframe(start),
                    ...layer.keyframes
                      .filter((k) => k.at > start && k.at < end)
                      .map((k) => keyframe(k.at)),
                    keyframe(end),
                  ]
                : [],
            };
          }),
        },
      };
    });
  });
}

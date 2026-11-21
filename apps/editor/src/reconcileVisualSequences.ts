import {
  sceneFrame,
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
        previous.end === step.start
      )
        run!.push(step);
      else runs.push([step]);
    }
    if (runs.length === 1 && runs[0]!.length === sequence.steps.length)
      return [sequence];
    return runs.map((steps, i) => {
      const start = steps[0]!.start,
        end = steps.at(-1)!.end,
        span = end - start;
      const raw = { ...sequence.scene, motionStrength: 1 };
      const first = sceneFrame(raw, start),
        last = sceneFrame(raw, end);
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
          staticProgress: Math.max(
            0,
            Math.min(1, (sequence.scene.staticProgress - start) / span),
          ),
          layers: sequence.scene.layers.map((layer, j) => {
            const { id: _a, ...a } = first[j]!,
              { id: _b, ...b } = last[j]!;
            // sceneFrame multiplies authored opacity; divide it out for track samples.
            return {
              ...layer,
              keyframes: layer.keyframes.length
                ? [
                    {
                      ...a,
                      opacity: layer.opacity
                        ? Math.min(1, Math.max(0, a.opacity / layer.opacity))
                        : 0,
                      at: 0,
                    },
                    ...layer.keyframes
                      .filter((k) => k.at > start && k.at < end)
                      .map((k) => ({ ...k, at: (k.at - start) / span })),
                    {
                      ...b,
                      opacity: layer.opacity
                        ? Math.min(1, Math.max(0, b.opacity / layer.opacity))
                        : 0,
                      at: 1,
                    },
                  ]
                : [],
            };
          }),
        },
      };
    });
  });
}

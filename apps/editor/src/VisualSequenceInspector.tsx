import type {
  VisualSequence,
  ProjectChapter,
} from "@earth-stories/story-schema";
import {
  ActionButton,
  FormField,
  InspectorSection,
  TextArea,
  TextInput,
} from "@earth-stories/ui";
export function VisualSequenceInspector({
  sequence,
  chapters,
  onChange,
  onRemove,
  onInspect,
}: {
  sequence: VisualSequence;
  chapters: ProjectChapter[];
  onChange: (next: VisualSequence) => void;
  onRemove: () => void;
  onInspect: (id: string) => void;
}) {
  return (
    <InspectorSection title="Continuous visual scene">
      <FormField label="Alternative description">
        <TextArea
          value={sequence.alt}
          onChange={(e) => onChange({ ...sequence, alt: e.target.value })}
        />
      </FormField>
      <FormField label="Caption">
        <TextArea
          value={sequence.caption}
          onChange={(e) => onChange({ ...sequence, caption: e.target.value })}
        />
      </FormField>
      <p>
        Chapter text stays in the normal content editor. Select a step to
        preview its artwork and motion.
      </p>
      {sequence.steps.map((step) => (
        <ActionButton
          key={step.chapterId}
          onClick={() => onInspect(step.chapterId)}
        >
          {chapters.find((c) => c.id === step.chapterId)?.title ??
            step.chapterId}
        </ActionButton>
      ))}
      {(
        [
          ["motionStrength", "Motion strength"],
          ["staticProgress", "Still frame"],
        ] as const
      ).map(([key, label]) => (
        <FormField key={key} label={label}>
          <TextInput
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={sequence.scene[key]}
            onChange={(e) =>
              onChange({
                ...sequence,
                scene: { ...sequence.scene, [key]: Number(e.target.value) },
              })
            }
          />
        </FormField>
      ))}
      <details>
        <summary>{sequence.scene.layers.length} artwork layers</summary>
        {sequence.scene.layers.map((layer) => (
          <div key={layer.id}>
            <strong>{layer.id}</strong>
            {layer.kind === "text" ? (
              <FormField label="Label">
                <TextInput
                  value={layer.text}
                  onChange={(e) =>
                    onChange({
                      ...sequence,
                      scene: {
                        ...sequence.scene,
                        layers: sequence.scene.layers.map((l) =>
                          l.id === layer.id
                            ? { ...layer, text: e.target.value }
                            : l,
                        ),
                      },
                    })
                  }
                />
              </FormField>
            ) : (
              <p>Vector artwork · {layer.keyframes.length} motion points</p>
            )}
          </div>
        ))}
      </details>
      <ActionButton onClick={onRemove}>Remove visual scene</ActionButton>
    </InspectorSection>
  );
}

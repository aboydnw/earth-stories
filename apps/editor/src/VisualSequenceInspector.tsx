import { useEffect, useState } from "react";
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
  const [altDraft, setAltDraft] = useState(sequence.alt);
  useEffect(() => setAltDraft(sequence.alt), [sequence.id, sequence.alt]);
  const altError = !altDraft.trim()
    ? "Enter a description. The story keeps the last valid description until you do."
    : altDraft.length > 2000
      ? "Use at most 2,000 characters."
      : undefined;
  return (
    <InspectorSection title="Continuous visual scene">
      <FormField label="Alternative description" required error={altError}>
        <TextArea
          value={altDraft}
          maxLength={2000}
          onChange={(e) => {
            const value = e.target.value;
            setAltDraft(value);
            if (value.trim() && value.length <= 2000)
              onChange({ ...sequence, alt: value });
          }}
        />
      </FormField>
      <FormField label="Caption">
        <TextArea
          maxLength={2000}
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
                  maxLength={2000}
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

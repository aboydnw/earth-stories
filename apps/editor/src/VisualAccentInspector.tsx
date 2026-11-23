import { useEffect, useState } from "react";
import type { VisualAccent } from "@earth-stories/story-schema";
import {
  ActionButton,
  FormField,
  InspectorSection,
  SelectInput,
  TextArea,
  TextInput,
} from "@earth-stories/ui";
export function VisualAccentInspector({
  accent,
  onChange,
  onRemove,
}: {
  accent: VisualAccent;
  onChange: (next: VisualAccent) => void;
  onRemove: () => void;
}) {
  const [alt, setAlt] = useState(accent.alt);
  useEffect(() => setAlt(accent.alt), [accent.id, accent.alt]);
  return (
    <InspectorSection title="Companion artwork">
      <p>
        Artwork stays beside your chapter content. Use the chapter preview to
        inspect it.
      </p>
      <FormField label="Artwork placement">
        <SelectInput
          value={accent.placement}
          onChange={(e) =>
            onChange({
              ...accent,
              placement: e.target.value as VisualAccent["placement"],
            })
          }
        >
          <option value="leading">Before chapter text</option>
          <option value="trailing">After chapter text</option>
          <option value="margin">Beside text when space allows</option>
        </SelectInput>
      </FormField>
      <FormField
        label="Alternative description"
        required
        error={
          !alt.trim()
            ? "Enter a description; the last valid description is preserved."
            : undefined
        }
      >
        <TextArea
          value={alt}
          maxLength={2000}
          onChange={(e) => {
            setAlt(e.target.value);
            if (e.target.value.trim() && e.target.value.length <= 2000)
              onChange({ ...accent, alt: e.target.value });
          }}
        />
      </FormField>
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
            value={accent.scene[key]}
            onChange={(e) =>
              onChange({
                ...accent,
                scene: { ...accent.scene, [key]: Number(e.target.value) },
              })
            }
          />
        </FormField>
      ))}
      <ActionButton variant="surface" onClick={onRemove}>
        Remove companion artwork
      </ActionButton>
    </InspectorSection>
  );
}

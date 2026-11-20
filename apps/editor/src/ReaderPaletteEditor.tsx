import {
  defaultReaderPalette,
  paletteRoles,
  type ReaderPalette,
} from "@earth-stories/story-schema";
import {
  ActionButton,
  FormField,
  InspectorSection,
  TextInput,
} from "@earth-stories/ui";
const labels = {
  background: "Background",
  surface: "Surface",
  text: "Text",
  mutedText: "Muted text",
  accent: "Accent",
  accentText: "Accent text",
};
export function ReaderPaletteEditor({
  value,
  onChange,
}: {
  value?: ReaderPalette;
  onChange: (value: ReaderPalette | undefined) => void;
}) {
  return (
    <InspectorSection
      title="Reader colors"
      description="These colors apply to your story, including illustrated scenes."
    >
      <div className="field-row">
        {paletteRoles.map((role) => (
          <FormField key={role} label={labels[role]}>
            <TextInput
              type="color"
              value={value?.[role] ?? defaultReaderPalette[role]}
              onChange={(e) => onChange({ ...value, [role]: e.target.value })}
            />
          </FormField>
        ))}
      </div>
      <ActionButton disabled={!value} onClick={() => onChange(undefined)}>
        Use theme colors
      </ActionButton>
    </InspectorSection>
  );
}

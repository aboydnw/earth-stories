import { IllustrationLayerControls } from "./IllustrationLayerControls";
import type {
  ProjectChapter,
  ProjectSource,
  SceneLayer,
} from "@earth-stories/story-schema";
import {
  ActionButton,
  FormField,
  InspectorSection,
  TextInput,
  TextArea,
} from "@earth-stories/ui";
import { ChapterContentSection } from "./chapter-editors/ChapterContentSection";
import { ChapterDataSelector } from "./ChapterDataSelector";
type Illustrated = Extract<ProjectChapter, { type: "illustrated" }>;
export function IllustrationInspector({
  chapter,
  sources,
  sourceUsage,
  onChange,
  onEditSource,
  onAddData,
  allowDataEditing = true,
}: {
  chapter: Illustrated;
  sources: ProjectSource[];
  sourceUsage: Record<string, number>;
  onChange: (chapter: Illustrated) => void;
  onEditSource: (id: string) => void;
  onAddData: () => void;
  allowDataEditing?: boolean;
}) {
  const updateLayer = (next: SceneLayer) =>
    onChange({
      ...chapter,
      scene: {
        ...chapter.scene,
        layers: chapter.scene.layers.map((l) => (l.id === next.id ? next : l)),
      },
    });
  const images = sources.filter((s) => s.kind === "image");
  return (
    <div className="chapter-type-editor">
      <ChapterContentSection
        chapter={chapter}
        onChange={(next) => onChange(next as Illustrated)}
      />
      <InspectorSection title="Illustration">
        <FormField label="Alternative description">
          <TextArea
            value={chapter.alt}
            onChange={(e) => onChange({ ...chapter, alt: e.target.value })}
          />
        </FormField>
        <FormField label="Caption">
          <TextInput
            value={chapter.caption}
            onChange={(e) => onChange({ ...chapter, caption: e.target.value })}
          />
        </FormField>
        {(
          [
            ["motionStrength", "Motion strength", 0, 1, 0.05],
            ["scrollLength", "Scroll length", 0.5, 5, 0.25],
            ["staticProgress", "Still frame", 0, 1, 0.01],
          ] as const
        ).map(([key, label, min, max, step]) => (
          <FormField key={key} label={label}>
            <TextInput
              type="range"
              min={min}
              max={max}
              step={step}
              value={chapter.scene[key]}
              onChange={(e) =>
                onChange({
                  ...chapter,
                  scene: { ...chapter.scene, [key]: Number(e.target.value) },
                })
              }
            />
          </FormField>
        ))}
      </InspectorSection>
      {chapter.scene.layers.map((layer, index) => (
        <InspectorSection
          key={layer.id}
          title={
            layer.kind === "image" && layer.alt
              ? layer.alt
              : `Layer ${index + 1}`
          }
        >
          {layer.kind === "text" ? (
            <FormField label={`Layer ${index + 1} text`}>
              <TextArea
                maxLength={2000}
                value={layer.text}
                onChange={(e) =>
                  updateLayer({ ...layer, text: e.target.value })
                }
              />
            </FormField>
          ) : null}
          {layer.kind === "image" ? (
            <>
              {allowDataEditing ? (
                <ChapterDataSelector
                  sourceId={layer.sourceId}
                  sources={images}
                  usageCount={sourceUsage[layer.sourceId] ?? 0}
                  onSelect={(sourceId) => updateLayer({ ...layer, sourceId })}
                  onEditSource={onEditSource}
                  onAddData={onAddData}
                />
              ) : null}
              <FormField label={`Layer ${index + 1} description`}>
                <TextInput
                  value={layer.alt}
                  onChange={(e) =>
                    updateLayer({ ...layer, alt: e.target.value })
                  }
                />
              </FormField>
            </>
          ) : null}
          <IllustrationLayerControls
            layer={layer}
            index={index}
            count={chapter.scene.layers.length}
            onChange={updateLayer}
            onMove={(direction) => {
              const layers = [...chapter.scene.layers];
              const target = index + direction;
              if (target < 0 || target >= layers.length) return;
              [layers[index], layers[target]] = [
                layers[target]!,
                layers[index]!,
              ];
              onChange({ ...chapter, scene: { ...chapter.scene, layers } });
            }}
            onRemove={() =>
              onChange({
                ...chapter,
                scene: {
                  ...chapter.scene,
                  layers: chapter.scene.layers.filter((l) => l.id !== layer.id),
                },
              })
            }
          />
          {layer.kind === "path" ? (
            <p>Vector artwork uses the story palette.</p>
          ) : null}
        </InspectorSection>
      ))}
      {!chapter.scene.layers.length ? (
        <p>This scene has no artwork yet. Add a label or an imported image.</p>
      ) : null}
      <ActionButton
        disabled={chapter.scene.layers.length >= 24}
        onClick={() =>
          onChange({
            ...chapter,
            scene: {
              ...chapter.scene,
              layers: [
                ...chapter.scene.layers,
                {
                  id: crypto.randomUUID(),
                  kind: "text",
                  text: "New label",
                  fontSize: 0.05,
                  colorRole: "text",
                  x: 0.1,
                  y: 0.1,
                  width: 0.8,
                  height: 0.3,
                  opacity: 1,
                  keyframes: [],
                },
              ],
            },
          })
        }
      >
        Add label
      </ActionButton>
      {allowDataEditing ? (
        <ActionButton
          disabled={!images.length || chapter.scene.layers.length >= 24}
          onClick={() =>
            onChange({
              ...chapter,
              scene: {
                ...chapter.scene,
                layers: [
                  ...chapter.scene.layers,
                  {
                    id: crypto.randomUUID(),
                    kind: "image",
                    sourceId: images[0]!.id,
                    alt: images[0]!.label,
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 1,
                    opacity: 1,
                    keyframes: [],
                  },
                ],
              },
            })
          }
        >
          Add image layer
        </ActionButton>
      ) : null}
      {!images.length ? (
        <ActionButton onClick={onAddData}>Import artwork</ActionButton>
      ) : null}
    </div>
  );
}

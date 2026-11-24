import type { SceneDefinition } from "@earth-stories/story-schema";
import { FormField, TextInput } from "@earth-stories/ui";
import { IllustrationLayerControls } from "./IllustrationLayerControls";
export function ArtworkLayerEditor({
  scene,
  onChange,
}: {
  scene: SceneDefinition;
  onChange: (scene: SceneDefinition) => void;
}) {
  return (
    <details>
      <summary>{scene.layers.length} artwork layers</summary>
      {scene.layers.map((layer, index) => (
        <section key={layer.id}>
          <strong>{layer.kind === "image" ? layer.alt : layer.id}</strong>
          {layer.kind === "image" ? (
            <FormField label="Layer description">
              <TextInput
                maxLength={2000}
                value={layer.alt}
                onChange={(e) =>
                  onChange({
                    ...scene,
                    layers: scene.layers.map((l) =>
                      l.id === layer.id ? { ...layer, alt: e.target.value } : l,
                    ),
                  })
                }
              />
            </FormField>
          ) : null}
          {layer.kind === "text" ? (
            <FormField label="Label">
              <TextInput
                maxLength={2000}
                value={layer.text}
                onChange={(e) =>
                  onChange({
                    ...scene,
                    layers: scene.layers.map((l) =>
                      l.id === layer.id
                        ? { ...layer, text: e.target.value }
                        : l,
                    ),
                  })
                }
              />
            </FormField>
          ) : null}
          <IllustrationLayerControls
            layer={layer}
            index={index}
            count={scene.layers.length}
            onChange={(next) =>
              onChange({
                ...scene,
                layers: scene.layers.map((l) => (l.id === next.id ? next : l)),
              })
            }
            onMove={(direction) => {
              const layers = [...scene.layers];
              const other = index + direction;
              if (other < 0 || other >= layers.length) return;
              [layers[index], layers[other]] = [layers[other]!, layers[index]!];
              onChange({ ...scene, layers });
            }}
            onRemove={() => {
              if (scene.layers.length > 1)
                onChange({
                  ...scene,
                  layers: scene.layers.filter((l) => l.id !== layer.id),
                });
            }}
          />
        </section>
      ))}
    </details>
  );
}

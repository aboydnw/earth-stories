import type { SceneLayer } from "@earth-stories/story-schema";
import {
  ActionButton,
  FormField,
  SelectInput,
  TextInput,
} from "@earth-stories/ui";
import {
  motionLayer,
  positionLayer,
  resizeLayer,
  type LayerMotion,
} from "./illustrationLayerEditing";
export function IllustrationLayerControls({
  layer,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  layer: SceneLayer;
  index: number;
  count: number;
  onChange: (layer: SceneLayer) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const prefix = `Layer ${index + 1}`;
  return (
    <>
      {(
        [
          ["x", "Horizontal position"],
          ["y", "Vertical position"],
        ] as const
      ).map(([axis, label]) => (
        <FormField key={axis} label={`${prefix} ${label.toLowerCase()}`}>
          <TextInput
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={layer[axis]}
            onChange={(e) =>
              onChange(positionLayer(layer, axis, Number(e.target.value)))
            }
          />
        </FormField>
      ))}
      <FormField label={`${prefix} size`}>
        <TextInput
          type="range"
          min={0.1}
          max={2}
          step={0.01}
          value={layer.width}
          onChange={(e) => onChange(resizeLayer(layer, Number(e.target.value)))}
        />
      </FormField>
      <FormField label={`${prefix} opacity`}>
        <TextInput
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={layer.opacity}
          onChange={(e) =>
            onChange({ ...layer, opacity: Number(e.target.value) })
          }
        />
      </FormField>
      <FormField
        label={`${prefix} motion`}
        hint="Choosing a preset replaces this layer’s current animation."
      >
        <SelectInput
          value={layer.keyframes.length ? "custom" : "still"}
          onChange={(e) =>
            onChange(motionLayer(layer, e.target.value as LayerMotion))
          }
        >
          {layer.keyframes.length ? (
            <option value="custom" disabled>
              Current animation
            </option>
          ) : null}
          <option value="still">Still</option>
          <option value="rise">Drift upward</option>
          <option value="left">Drift left</option>
          <option value="right">Drift right</option>
          <option value="closer">Move closer</option>
        </SelectInput>
      </FormField>
      <div className="field-row">
        <ActionButton
          variant="ghost"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          aria-label={`${prefix} move backward`}
        >
          Move backward
        </ActionButton>
        <ActionButton
          variant="ghost"
          disabled={index === count - 1}
          onClick={() => onMove(1)}
          aria-label={`${prefix} move forward`}
        >
          Move forward
        </ActionButton>
        <ActionButton
          variant="ghost"
          disabled={count <= 1}
          onClick={onRemove}
          aria-label={`${prefix} remove`}
        >
          Remove layer
        </ActionButton>
      </div>
    </>
  );
}

import { useState } from "react";
import type { Camera, FlyoverKeyframe } from "@earth-stories/story-schema";
import { interpolateFlyover } from "@earth-stories/viewer";
import {
  CollapsibleSection,
  FormField,
  NumberInput,
  TextInput,
} from "@earth-stories/ui";
import {
  captureKeyframe,
  createApproachPreset,
  createOrbitPreset,
  flyoverWarnings,
  recaptureKeyframe,
  reorderKeyframe,
} from "./flyoverPath";

export function FlyoverPathEditor({
  keyframes,
  currentCamera,
  onChange,
  onPreviewCamera,
}: {
  keyframes: FlyoverKeyframe[];
  currentCamera: Camera | null;
  onChange: (keyframes: FlyoverKeyframe[]) => void;
  onPreviewCamera: (camera: Camera) => void;
}) {
  const [previewProgress, setPreviewProgress] = useState(0);
  const warnings = flyoverWarnings(keyframes);
  return (
    <div className="flyover-path-editor">
      <div className="flyover-path-editor__actions">
        <button
          type="button"
          disabled={!currentCamera}
          onClick={() =>
            currentCamera &&
            onChange([...keyframes, captureKeyframe(currentCamera)])
          }
        >
          Add keyframe from current view
        </button>
        <button
          type="button"
          disabled={!currentCamera}
          onClick={() =>
            currentCamera && onChange(createOrbitPreset(currentCamera))
          }
        >
          Orbit preset
        </button>
        <button
          type="button"
          disabled={!currentCamera}
          onClick={() =>
            currentCamera && onChange(createApproachPreset(currentCamera))
          }
        >
          Approach preset
        </button>
      </div>
      {warnings.map((warning) => (
        <p key={warning} className="chapter-field-warning" role="status">
          {warning}
        </p>
      ))}
      <label className="flyover-scrubber">
        Preview path
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={previewProgress}
          onChange={(event) => {
            const progress = Number(event.target.value);
            setPreviewProgress(progress);
            const camera = interpolateFlyover(keyframes, progress);
            if (camera) onPreviewCamera(camera);
          }}
        />
      </label>
      <ol className="flyover-keyframes">
        {keyframes.map((frame, index) => (
          <li key={index}>
            <div className="flyover-keyframe__summary">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{frame.caption || `View ${index + 1}`}</strong>
                <small>
                  Zoom {frame.zoom.toFixed(1)} · Pitch {Math.round(frame.pitch)}
                  ° · Bearing {Math.round(frame.bearing)}°
                </small>
              </div>
            </div>
            <FormField label={`Keyframe ${index + 1} caption`}>
              <TextInput
                value={frame.caption}
                onChange={(event) =>
                  onChange(
                    keyframes.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, caption: event.target.value }
                        : candidate,
                    ),
                  )
                }
              />
            </FormField>
            <div className="flyover-keyframe__actions">
              <button type="button" onClick={() => onPreviewCamera(frame)}>
                Jump
              </button>
              <button
                type="button"
                disabled={index === 0}
                onClick={() =>
                  onChange(reorderKeyframe(keyframes, index, index - 1))
                }
              >
                Move up
              </button>
              <button
                type="button"
                disabled={index === keyframes.length - 1}
                onClick={() =>
                  onChange(reorderKeyframe(keyframes, index, index + 1))
                }
              >
                Move down
              </button>
              <button
                type="button"
                disabled={!currentCamera}
                onClick={() =>
                  currentCamera &&
                  onChange(
                    keyframes.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? recaptureKeyframe(candidate, currentCamera)
                        : candidate,
                    ),
                  )
                }
              >
                Recapture
              </button>
              <button
                type="button"
                disabled={keyframes.length <= 2}
                onClick={() =>
                  onChange(
                    keyframes.filter(
                      (_, candidateIndex) => candidateIndex !== index,
                    ),
                  )
                }
              >
                Delete
              </button>
            </div>
            <CollapsibleSection
              title="Exact coordinates"
              summary={`${frame.center[0].toFixed(2)}, ${frame.center[1].toFixed(2)}`}
            >
              <div className="chapter-coordinate-grid">
                {["Longitude", "Latitude", "Zoom", "Bearing", "Pitch"].map(
                  (label, fieldIndex) => {
                    const values = [
                      frame.center[0],
                      frame.center[1],
                      frame.zoom,
                      frame.bearing,
                      frame.pitch,
                    ];
                    return (
                      <FormField key={label} label={label}>
                        <NumberInput
                          step="any"
                          value={values[fieldIndex]}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            onChange(
                              keyframes.map((candidate, candidateIndex) =>
                                candidateIndex !== index
                                  ? candidate
                                  : fieldIndex === 0
                                    ? {
                                        ...candidate,
                                        center: [value, candidate.center[1]],
                                      }
                                    : fieldIndex === 1
                                      ? {
                                          ...candidate,
                                          center: [candidate.center[0], value],
                                        }
                                      : fieldIndex === 2
                                        ? { ...candidate, zoom: value }
                                        : fieldIndex === 3
                                          ? { ...candidate, bearing: value }
                                          : { ...candidate, pitch: value },
                              ),
                            );
                          }}
                        />
                      </FormField>
                    );
                  },
                )}
              </div>
            </CollapsibleSection>
          </li>
        ))}
      </ol>
    </div>
  );
}

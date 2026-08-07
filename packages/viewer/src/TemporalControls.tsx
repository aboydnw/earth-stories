import { timestepIndex, timestepPosition } from "./temporal.js";

export function TemporalControls({
  position,
  label,
  playing,
  speed,
  stepCount,
  onScrub,
  onStep,
  onToggle,
  onSpeed,
}: {
  position: number;
  label: string;
  playing: boolean;
  speed: number;
  stepCount?: number;
  onScrub: (position: number) => void;
  onStep: (offset: number) => void;
  onToggle: () => void;
  onSpeed: (speed: number) => void;
}) {
  const discrete = !!stepCount && stepCount > 1;
  const index = discrete ? timestepIndex(position, stepCount) : 0;
  return (
    <div className="story-map__time" aria-label="Time controls">
      <div className="story-map__time-row">
        {discrete ? (
          <button
            type="button"
            aria-label="Previous timestep"
            disabled={index === 0}
            onClick={() => onStep(-1)}
          >
            ‹
          </button>
        ) : null}
        <button
          type="button"
          className="story-map__time-play"
          aria-label={playing ? "Pause animation" : "Play animation"}
          onClick={onToggle}
        >
          {playing ? "Pause" : "Play"}
        </button>
        {discrete ? (
          <button
            type="button"
            aria-label="Next timestep"
            disabled={index === stepCount - 1}
            onClick={() => onStep(1)}
          >
            ›
          </button>
        ) : null}
        <span className="story-map__time-label">{label}</span>
        <select
          aria-label="Playback speed"
          value={speed}
          onChange={(event) => onSpeed(Number(event.target.value))}
        >
          <option value="0.5">0.5×</option>
          <option value="1">1×</option>
          <option value="2">2×</option>
        </select>
      </div>
      <input
        type="range"
        aria-label={discrete ? "Select timestep" : "Scrub time"}
        aria-valuetext={label}
        min="0"
        max={discrete ? stepCount - 1 : 1000}
        step="1"
        value={discrete ? index : Math.round(position * 1000)}
        onChange={(event) =>
          onScrub(
            discrete
              ? timestepPosition(Number(event.target.value), stepCount)
              : Number(event.target.value) / 1000,
          )
        }
      />
    </div>
  );
}

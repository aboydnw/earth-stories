import { useEffect, useRef, useState } from "react";
import type { PublicationAsset } from "@earth-stories/story-schema";
import { timestepIndex, timestepPosition } from "./temporal.js";

export function TemporalControls({
  position,
  label,
  playing,
  speed,
  stepCount,
  timesteps,
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
  timesteps?: NonNullable<PublicationAsset["zarr"]>["timesteps"];
  onScrub: (position: number) => void;
  onStep: (offset: number) => void;
  onToggle: () => void;
  onSpeed: (speed: number) => void;
}) {
  const discrete = !!stepCount && stepCount > 1;
  const index = discrete ? timestepIndex(position, stepCount) : 0;
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!calendarOpen) return;
    const close = (event: MouseEvent) => {
      if (!calendarRef.current?.contains(event.target as Node))
        setCalendarOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [calendarOpen]);
  return (
    <div className="story-map__time" aria-label="Time controls">
      <div className="story-map__time-row">
        <div className="story-map__time-calendar" ref={calendarRef}>
          <button
            type="button"
            className="story-map__time-date"
            aria-label="Select date"
            aria-expanded={calendarOpen}
            onClick={() => setCalendarOpen((open) => !open)}
          >
            <span aria-hidden="true">▣</span>
            <span>{label}</span>
          </button>
          {calendarOpen && timesteps?.length ? (
            <div
              className="story-map__time-dates"
              role="listbox"
              aria-label="Available dates"
            >
              {timesteps.map((timestep, timestepNumber) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={timestepNumber === index}
                  className={timestepNumber === index ? "is-active" : undefined}
                  key={`${timestep.index}-${timestep.label}`}
                  onClick={() => {
                    onScrub(timestepPosition(timestepNumber, stepCount!));
                    setCalendarOpen(false);
                  }}
                >
                  {timestep.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="story-map__time-transport">
          {discrete ? (
            <button
              type="button"
              aria-label="Previous timestep"
              disabled={index === 0}
              onClick={() => onStep(-1)}
            >
              <span aria-hidden="true">‹</span>
            </button>
          ) : null}
          <button
            type="button"
            className="story-map__time-play"
            aria-label={playing ? "Pause animation" : "Play animation"}
            onClick={onToggle}
          >
            <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
          </button>
          {discrete ? (
            <button
              type="button"
              aria-label="Next timestep"
              disabled={index === stepCount - 1}
              onClick={() => onStep(1)}
            >
              <span aria-hidden="true">›</span>
            </button>
          ) : null}
        </div>
        <div className="story-map__time-speeds" aria-label="Playback speed">
          {[0.5, 1, 2].map((option) => (
            <button
              type="button"
              key={option}
              aria-label={`Play at ${option} times speed`}
              aria-pressed={speed === option}
              className={speed === option ? "is-active" : undefined}
              onClick={() => onSpeed(option)}
            >
              {option}×
            </button>
          ))}
        </div>
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
      <span className="story-map__time-count">
        {discrete ? `${index + 1} of ${stepCount}` : label}
      </span>
    </div>
  );
}

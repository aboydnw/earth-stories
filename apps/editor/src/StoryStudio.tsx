import { ActionButton } from "@earth-stories/ui";
import { useEffect, useId, useRef, useState } from "react";
import frontsRaw from "./storyStudioFronts.json?raw";
import { studioFrame, studioTreatments } from "./storyStudioMotion";
import "./storyStudio.css";

type Variant = keyof typeof studioTreatments | "remix";
type Selection = "House" | "Shoreline" | "Date labels";
const variants: {
  id: Exclude<Variant, "remix">;
  title: string;
  reason: string;
}[] = [
  {
    id: "original",
    title: "Static baseline",
    reason: "Same view; the dated outlines do the work.",
  },
  {
    id: "house",
    title: "House as landmark",
    reason: "Open close to an illustrative foreground landmark.",
  },
  {
    id: "shoreline",
    title: "Shoreline as anchor",
    reason: "Keep the bend in view and reveal dates one at a time.",
  },
];
const source = JSON.parse(frontsRaw) as {
  features: {
    properties: { month: string };
    geometry: { coordinates: [number, number][][] };
  }[];
};
const observations = ["2015-01", "2024-12"].map((month) => {
  const front = source.features.find(
    (feature) => feature.properties.month === month,
  );
  if (!front) throw new Error("Story Studio source is missing " + month);
  return front;
});
const points = observations.flatMap(({ geometry }) =>
  geometry.coordinates.flat(),
);
const west = Math.min(...points.map(([lon]) => lon));
const east = Math.max(...points.map(([lon]) => lon));
const south = Math.min(...points.map(([, lat]) => lat));
const north = Math.max(...points.map(([, lat]) => lat));
const projection = Math.cos((((north + south) / 2) * Math.PI) / 180);
const units = Math.min(
  360 / ((east - west) * projection),
  210 / (north - south),
);
const observedPaths = observations.map(({ geometry }) =>
  geometry.coordinates
    .map((line) =>
      line
        .map(
          ([lon, lat], index) =>
            (index === 0 ? "M" : "L") +
            (340 + (lon - (west + east) / 2) * projection * units).toFixed(2) +
            "," +
            (177 - (lat - (south + north) / 2) * units).toFixed(2),
        )
        .join(" "),
    )
    .join(" "),
);

export function StoryStudio({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<Selection>("House");
  const [showOptions, setShowOptions] = useState(false);
  const [variant, setVariant] = useState<Variant>("original");
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [staticPreview, setStaticPreview] = useState(false);
  const [reduced, setReduced] = useState(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
  );
  const [note, setNote] = useState("");
  const [remixParent, setRemixParent] = useState<Variant | null>(null);
  const water = useId();
  const select = (element: Selection) => {
    setSelected(element);
    setShowOptions(false);
  };
  const close = useRef<HTMLElement>(null);
  useEffect(() => {
    close.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media?.matches ?? false);
    media?.addEventListener("change", change);
    return () => media?.removeEventListener("change", change);
  }, []);
  const still = reduced || staticPreview;
  useEffect(() => {
    if (!playing || still || progress >= 1) return;
    const timer = window.setTimeout(
      () => setProgress(Math.min(1, progress + 0.01)),
      40,
    );
    return () => window.clearTimeout(timer);
  }, [playing, progress, still]);
  const scene = studioFrame(
    variant === "remix"
      ? { ...studioTreatments.house, label: "staggered" }
      : studioTreatments[variant],
    progress,
    still || variant === "original",
  );
  const play = playing && progress < 1;
  const motionUnavailable = still || variant === "original";
  return (
    <section className="story-studio" aria-label="Edge of Ice Story Studio">
      <header className="story-studio__header" ref={close}>
        <div>
          <small>Experimental · Local rehearsal</small>
          <h2>Edge of Ice / Story Studio</h2>
        </div>
        <ActionButton
          variant="surface"
          className="secondary-button"
          type="button"
          onClick={onClose}
        >
          Back to editor
        </ActionButton>
      </header>
      <p>
        Notice · Quiet unease. Keep the shoreline recognizable. Don’t invent ice
        positions.
      </p>
      <div className="story-studio__layout">
        <div>
          <figure>
            <svg
              viewBox="0 0 640 370"
              role="img"
              aria-label="Illustrative fjord with sourced January 2015 and December 2024 Kronebreen fronts revealed as separate observations."
            >
              <defs>
                <pattern
                  id={water}
                  width="37"
                  height="17"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 0 10 Q 9 6 19 10 T 37 10"
                    fill="none"
                    stroke="#c8e4de"
                    strokeOpacity=".22"
                  />
                </pattern>
              </defs>
              <rect width="640" height="370" fill="#173d48" />
              <g
                transform={`translate(${scene.anchorX} ${scene.anchorY}) scale(${scene.scale}) translate(${-scene.anchorX} ${-scene.anchorY})`}
              >
                <path
                  d="M0 110 L60 78 145 148 202 95 277 120 330 60 400 118 479 37 563 136 640 101 V0 H0Z"
                  fill="#8da99d"
                />
                <path
                  d="M0 290 Q110 220 180 240 Q250 280 303 240 Q403 207 478 276 Q540 315 640 249 V390 H0 Z"
                  fill="#72998e"
                  stroke="#c6dbc9"
                  strokeWidth={selected === "Shoreline" ? 4 : 2}
                  onClick={() => select("Shoreline")}
                />
                <path
                  d="M0 152 Q170 131 208 148 Q243 166 259 145 Q292 112 352 121 Q461 119 495 103 Q543 81 640 131 V0 H0Z"
                  fill="#42676c"
                  stroke="#abccc0"
                  strokeWidth={2}
                />
                <rect
                  y="156"
                  width="640"
                  height="160"
                  fill={`url(#${water})`}
                />
                {(variant === "house" || variant === "remix") && (
                  <g
                    opacity={scene.foreground}
                    pointerEvents={scene.foreground > 0 ? "auto" : "none"}
                    onClick={() => select("House")}
                  >
                    <path
                      d="M137 235 V209 L162 189 189 209 V235Z"
                      fill="#d7ad75"
                    />
                    <path d="M158 235 V218 H169 V235Z" fill="#173d48" />
                  </g>
                )}
                <path
                  data-observation="2015-01"
                  d={observedPaths[0]}
                  fill="none"
                  stroke="#ffd18c"
                  strokeWidth={3}
                  opacity={scene.first ? 1 : 0}
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  data-observation="2024-12"
                  d={observedPaths[1]}
                  fill="none"
                  stroke="#e1bfff"
                  strokeWidth={3}
                  strokeDasharray="5 3"
                  opacity={scene.last ? 1 : 0}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
              <text x="20" y="35" fill="#e5f0ef" fontSize="19">
                Kronebreen · Kongsfjorden
              </text>
              <text
                x="20"
                y="339"
                fill="#ffd18c"
                fontSize="18"
                opacity={scene.firstLabel ? 1 : 0}
              >
                ━ January 2015
              </text>
              <text
                x="319"
                y="339"
                fill="#e1bfff"
                fontSize="18"
                opacity={scene.last ? 1 : 0}
              >
                ┄ December 2024
              </text>
            </svg>
            <figcaption>
              Shore and house are illustrative, not geographic evidence. Front
              geometry:{" "}
              <a href="https://zenodo.org/records/22129588">
                Pyles et al., v4 (CC BY 4.0)
              </a>
              .
            </figcaption>
          </figure>
          {variant === "original" && (
            <p role="status">
              This is a static illustration. Choose an animated treatment using
              Sketch alternatives to rehearse motion.
            </p>
          )}
          <div className="story-studio__controls">
            <ActionButton
              variant="surface"
              type="button"
              className="secondary-button"
              disabled={motionUnavailable}
              onClick={() => {
                if (progress >= 1) setProgress(0);
                setPlaying(!play);
              }}
            >
              {play && !still && variant !== "original" ? "Pause" : "Play"}
            </ActionButton>
            <label>
              Rehearsal position{" "}
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(progress * 100)}
                disabled={motionUnavailable}
                onChange={(event) => {
                  setPlaying(false);
                  setProgress(Number(event.currentTarget.value) / 100);
                }}
              />
            </label>
            <ActionButton
              variant="surface"
              type="button"
              className="secondary-button"
              aria-pressed={staticPreview || reduced}
              disabled={reduced}
              onClick={() => {
                setPlaying(false);
                setStaticPreview(!staticPreview);
              }}
            >
              Read without motion
            </ActionButton>
          </div>
          <div className="story-studio__controls" aria-label="Jump to keyframe">
            {(
              [
                ["Arrive", 0],
                ["Orient", 0.55],
                ["Notice", 1],
              ] as const
            ).map(([name, position]) => (
              <ActionButton
                variant="surface"
                type="button"
                className="secondary-button"
                key={name}
                disabled={motionUnavailable}
                onClick={() => {
                  setPlaying(false);
                  setProgress(position);
                }}
              >
                {name}
              </ActionButton>
            ))}
          </div>
          {(scene.gap || still) && (
            <p className="story-studio__gap">
              <strong>Six months have no mapped front:</strong> March to July
              2015 and December 2015. A blank in the record does not mean the
              ice stayed still.
            </p>
          )}
        </div>
        <aside aria-label="Design partner">
          <h3>Point, then ask</h3>
          <div className="story-studio__controls">
            {(["House", "Shoreline", "Date labels"] as const).map((element) => (
              <ActionButton
                variant="surface"
                type="button"
                className="secondary-button"
                aria-pressed={selected === element}
                key={element}
                onClick={() => {
                  setSelected(element);
                  setShowOptions(false);
                }}
              >
                {element}
              </ActionButton>
            ))}
          </div>
          <label>
            Note about {selected}
            <textarea
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
              placeholder="What should the reader notice?"
            />
          </label>
          <ActionButton
            variant="surface"
            type="button"
            className="secondary-button"
            onClick={() => setShowOptions(true)}
          >
            Sketch alternatives for {selected.toLowerCase()}
          </ActionButton>
          {showOptions && (
            <>
              <p role="status">
                Curated sketches for {selected.toLowerCase()}. Compare at the
                same playhead position.
              </p>
              <div className="story-studio__variants">
                {variants.map((option) => (
                  <ActionButton
                    variant="surface"
                    type="button"
                    key={option.id}
                    className="secondary-button"
                    aria-pressed={variant === option.id}
                    onClick={() => {
                      setPlaying(false);
                      setVariant(option.id);
                    }}
                  >
                    <strong>{option.title}</strong>
                    <span>{option.reason}</span>
                  </ActionButton>
                ))}
              </div>
              {remixParent === null ? (
                <ActionButton
                  variant="surface"
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setPlaying(false);
                    setRemixParent(variant);
                    setVariant("remix");
                  }}
                >
                  Remix house + staggered dates
                </ActionButton>
              ) : (
                <div className="story-studio__controls">
                  <ActionButton
                    variant="surface"
                    type="button"
                    className="secondary-button"
                    aria-pressed={variant === "remix"}
                    onClick={() => {
                      setPlaying(false);
                      setVariant("remix");
                    }}
                  >
                    View remix
                  </ActionButton>
                  <ActionButton
                    variant="surface"
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setPlaying(false);
                      if (variant === "remix") setVariant(remixParent);
                      setRemixParent(null);
                    }}
                  >
                    Undo remix
                  </ActionButton>
                </div>
              )}
            </>
          )}
          <p>
            Rehearsal only. Nothing here changes your saved story or published
            output.
          </p>
        </aside>
      </div>
    </section>
  );
}

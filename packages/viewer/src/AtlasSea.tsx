import type { CSSProperties } from "react";

/** Decorative ink planes, deliberately independent of the meteorological data. */
export function AtlasSea({
  artworkHref,
  opening,
  progress,
  moving,
}: {
  artworkHref?: string;
  opening: boolean;
  progress: number;
  moving: boolean;
}) {
  const reveal = opening ? 1 : 1 - progress;
  return (
    <div
      className={`atlas-sea${opening ? " atlas-sea--opening" : ""}`}
      aria-hidden="true"
      data-moving={moving}
      style={{ "--sea-reveal": reveal } as CSSProperties}
    >
      <div className="atlas-sea__vista">
        {artworkHref && (
          <img className="atlas-sea__engraving" src={artworkHref} alt="" />
        )}
        <div className="atlas-sea__shade" />
        <svg
          className="atlas-sea__clouds atlas-sea__plane"
          viewBox="0 0 1600 600"
          preserveAspectRatio="xMidYMin slice"
          fill="none"
        >
          <g className="atlas-sea__cloud-bank">
            {Array.from({ length: 8 }, (_, index) => (
              <path
                key={index}
                d="M-160 140C-45 70 22 175 128 108S264 32 338 98 489 119 550 50 702 15 760 84 903 127 966 51 1120 2 1196 71 1348 114 1421 38 1567 6 1760 89"
                transform={`translate(${index * 4} ${index * 7})`}
              />
            ))}
          </g>
          <g className="atlas-sea__cloud-bank atlas-sea__cloud-bank--near">
            {Array.from({ length: 5 }, (_, index) => (
              <path
                key={index}
                d="M70 310C152 275 220 329 285 278S413 198 478 247 589 300 648 245 774 193 841 247 978 292 1037 226 1170 173 1247 229 1385 268 1498 192 1644 176 1740 224"
                transform={`translate(${index * -3} ${index * 6})`}
              />
            ))}
          </g>
        </svg>
      </div>
      <svg
        className="atlas-sea__water atlas-sea__water--far atlas-sea__plane"
        viewBox="0 0 1600 320"
        preserveAspectRatio="none"
      >
        <path
          className="atlas-sea__wave-fill"
          d="M-200 140C-80 70 44 180 182 119S366 67 482 131 688 196 826 125 1002 60 1153 129 1354 185 1490 111 1652 99 1800 133V320H-200Z"
        />
        {Array.from({ length: 9 }, (_, index) => (
          <path
            key={index}
            className="atlas-sea__wave-line"
            d="M-200 140C-80 70 44 180 182 119S366 67 482 131 688 196 826 125 1002 60 1153 129 1354 185 1490 111 1652 99 1800 133"
            transform={`translate(${index * 3} ${index * 9})`}
          />
        ))}
      </svg>
      <svg
        className="atlas-sea__water atlas-sea__water--near atlas-sea__plane"
        viewBox="0 0 1600 320"
        preserveAspectRatio="none"
      >
        <path
          className="atlas-sea__wave-fill"
          d="M-200 180C-10 125 54 250 233 175S421 92 594 177 819 219 977 151 1165 104 1310 182 1517 227 1800 152V320H-200Z"
        />
        {Array.from({ length: 8 }, (_, index) => (
          <path
            key={index}
            className="atlas-sea__wave-line"
            d="M-200 180C-10 125 54 250 233 175S421 92 594 177 819 219 977 151 1165 104 1310 182 1517 227 1800 152"
            transform={`translate(${index * -4} ${index * 8})`}
          />
        ))}
      </svg>
    </div>
  );
}

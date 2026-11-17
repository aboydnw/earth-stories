import type { CSSProperties } from "react";

/**
 * Original, schematic artwork. Chapter progress changes our viewpoint, never
 * the glacier geometry: the scientific fronts remain in the evidence maps.
 */
export function AtlasIce({
  chapterIndex,
  chapterCount,
  progress,
  moving,
  opening,
}: {
  chapterIndex: number;
  chapterCount: number;
  progress: number;
  moving: boolean;
  opening: boolean;
}) {
  const position = chapterIndex / Math.max(1, chapterCount - 1);
  return (
    <figure className="atlas-ice-scene" data-opening={opening}>
      <div
        className="atlas-ice"
        aria-hidden="true"
        data-moving={moving}
        style={
          {
            "--ice-view": position,
            "--ice-arrival": progress,
          } as CSSProperties
        }
      >
        <svg
          viewBox="0 0 1440 480"
          preserveAspectRatio="xMidYMid slice"
          focusable="false"
        >
          <path className="atlas-ice__sky" d="M0 0H1440V480H0Z" />
          <g className="atlas-ice__sky-lines" fill="none">
            <path d="M-50 86Q340 22 715 83T1500 50M-50 103Q340 39 715 100T1500 67M-50 120Q340 56 715 117T1500 84" />
            <path d="M925 25V79M898 52H952M906 33L944 71M944 33L906 71" />
          </g>
          <g className="atlas-ice__far">
            <path
              fill="#71909c"
              d="M0 272L110 169L185 205L314 69L406 177L502 111L617 236L742 157L855 233L990 110L1102 173L1180 67L1330 216L1440 143V400H0Z"
            />
            <path
              fill="#c9dce0"
              d="M244 145L314 69L377 143L334 120L311 148L288 123ZM451 153L502 111L547 161L505 147L487 159ZM1126 138L1180 67L1252 143L1192 111L1170 135L1153 112Z"
            />
            <g stroke="#a6bfc5" fill="none" strokeWidth="1.5">
              <path d="M314 95L245 225M322 132L297 236M502 148L455 242M1183 113L1112 270M1201 137L1265 253M990 145L951 247" />
            </g>
          </g>
          <path
            fill="#365967"
            d="M0 273Q280 248 513 262T963 255T1440 273V480H0Z"
          />
          <g className="atlas-ice__glacier">
            <path
              fill="#d5e9e9"
              d="M620 206L781 205L930 315L872 342L819 331L768 352L716 338L662 349L602 325L543 335L498 310Z"
            />
            <path
              fill="#a7cbd3"
              d="M498 310L543 335L602 325L662 349L716 338L768 352L819 331L872 342L930 315V356L871 378L820 366L768 387L715 371L661 383L602 359L542 369L498 347Z"
            />
            <g stroke="#6b99a9" fill="none" strokeWidth="2">
              <path d="M636 222L581 289L608 300M667 221L642 273L669 286L647 307M699 219L708 265L693 289L719 314M743 219L785 278L758 294L795 317M778 222L847 281L822 294M543 342V359M602 332V353M661 355V376M716 345V365M768 359V380M819 338V359M871 348V371" />
            </g>
          </g>
          <g className="atlas-ice__near">
            <path
              fill="#253e4a"
              d="M0 212L139 275L244 299L367 371L526 480H0ZM1440 197L1323 259L1242 290L1110 355L967 480H1440Z"
            />
            <g fill="none" stroke="#537481" strokeWidth="2">
              <path d="M0 247L134 298L229 326L364 402M0 274L128 326L221 348L375 448M1440 237L1330 282L1255 315L1120 390M1440 271L1351 301L1256 343L1132 424" />
            </g>
          </g>
          <g
            className="atlas-ice__water"
            fill="none"
            stroke="#9ac1cb"
            strokeWidth="1.4"
          >
            <path d="M485 391H604M798 405H960M562 428H769M815 449H976M625 465H803M433 410H487M970 378H1038" />
            <path
              d="M596 402H682M719 420H815M519 451H570M835 389H892"
              opacity=".45"
            />
          </g>
        </svg>
        <span className="atlas-ice__latitude">
          A fjord at the edge of the Arctic
        </span>
      </div>
      <figcaption>
        Illustrated fjord. Not a map or measured ice change; use the
        observations below for evidence.
      </figcaption>
    </figure>
  );
}

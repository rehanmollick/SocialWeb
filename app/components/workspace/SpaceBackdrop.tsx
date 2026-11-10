import { memo } from "react";
// Deterministic, non-interactive scenery. No animation loop or network assets.
function SpaceBackdrop() {
  return (
    <svg
      className="space-backdrop"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="nebula-violet">
          <stop stopColor="#7655b3" stopOpacity=".34" />
          <stop offset=".45" stopColor="#343163" stopOpacity=".15" />
          <stop offset="1" stopColor="#171932" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="nebula-blue">
          <stop stopColor="#366387" stopOpacity=".32" />
          <stop offset=".6" stopColor="#1c3552" stopOpacity=".12" />
          <stop offset="1" stopColor="#09111d" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="planet-shade" cx=".3" cy=".23">
          <stop stopColor="#948da9" />
          <stop offset=".38" stopColor="#39354e" />
          <stop offset=".8" stopColor="#101522" />
          <stop offset="1" stopColor="#080c16" />
        </radialGradient>
        <radialGradient id="moon-shade" cx=".7" cy=".25">
          <stop stopColor="#a9937c" />
          <stop offset=".45" stopColor="#433a36" />
          <stop offset="1" stopColor="#0b0e18" />
        </radialGradient>
        <linearGradient id="comet-trail">
          <stop stopColor="#cbd9ff" stopOpacity="0" />
          <stop offset="1" stopColor="#cbd9ff" stopOpacity=".65" />
        </linearGradient>
      </defs>
      <ellipse
        cx="300"
        cy="260"
        rx="660"
        ry="430"
        fill="url(#nebula-violet)"
        transform="rotate(-24 300 260)"
      />
      <ellipse
        cx="1040"
        cy="620"
        rx="740"
        ry="400"
        fill="url(#nebula-blue)"
        transform="rotate(-27 1040 620)"
      />
      <ellipse
        cx="1040"
        cy="80"
        rx="400"
        ry="320"
        fill="url(#nebula-violet)"
        opacity=".65"
      />
      {Array.from({ length: 620 }, (_, i) => {
        const x = (i * 137.507764 + Math.sin(i * 43) * 55 + 1440) % 1440,
          y = (i * i * 17.137 + 31) % 900,
          r = i % 31 === 0 ? 1.6 : i % 9 === 0 ? 1 : 0.45;
        return (
          <g key={i} opacity={i % 31 === 0 ? 0.8 : i % 9 === 0 ? 0.55 : 0.24}>
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={
                i % 4 === 0 ? "#b9a7e7" : i % 7 === 0 ? "#dfc5a3" : "#bfcfe9"
              }
            />
            {i % 62 === 0 && (
              <path
                d={`M${x - 5},${y}h10 M${x},${y - 5}v10`}
                stroke="#d8e3ff"
                strokeWidth=".5"
              />
            )}
          </g>
        );
      })}
      <g opacity=".24" transform="translate(113 710) rotate(-24)">
        <ellipse
          rx="160"
          ry="46"
          fill="none"
          stroke="#9194b3"
          strokeWidth=".8"
        />
        <ellipse
          rx="142"
          ry="38"
          fill="none"
          stroke="#81849e"
          strokeWidth="8"
          opacity=".25"
        />
        <circle
          r="58"
          fill="url(#planet-shade)"
          stroke="#9e96b0"
          strokeWidth=".6"
        />
        <path
          d="M-157 0 A157 44 0 0 0 157 0"
          fill="none"
          stroke="#8f8fae"
          strokeWidth="3"
          opacity=".5"
        />
      </g>
      <g opacity=".21">
        <circle
          cx="1330"
          cy="170"
          r="34"
          fill="url(#moon-shade)"
          stroke="#947f68"
          strokeWidth=".7"
        />
        <circle cx="1258" cy="146" r="4" fill="#9c928c" />
        <ellipse
          cx="1330"
          cy="170"
          rx="108"
          ry="47"
          transform="rotate(-32 1330 170)"
          fill="none"
          stroke="#9599b3"
          strokeWidth=".4"
          strokeDasharray="2 9"
        />
      </g>
      <path d="M85 228 L166 192" stroke="url(#comet-trail)" strokeWidth="1.4" />
      <circle cx="166" cy="192" r="1.4" fill="#d4dfff" opacity=".7" />
      <g fill="none" stroke="#8394bf" opacity=".09">
        <path d="M1070 779l56-30 40 25 63-58 42 21" />
        <circle cx="1070" cy="779" r="3" />
        <circle cx="1126" cy="749" r="2" />
        <circle cx="1166" cy="774" r="3" />
        <circle cx="1229" cy="716" r="2" />
      </g>
      <ellipse
        cx="740"
        cy="450"
        rx="690"
        ry="310"
        transform="rotate(-25 740 450)"
        fill="none"
        stroke="#93a3cf"
        strokeOpacity=".035"
      />
    </svg>
  );
}
export default memo(SpaceBackdrop);

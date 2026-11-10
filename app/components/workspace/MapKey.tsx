import { colorFor, groupName, type Graph } from "@/lib/graph/types";
import { circleColor, circleIcon, JUDGMENTS } from "@/lib/graph/indicators";
export default function MapKey({
  graph,
  onClose,
}: {
  graph: Graph;
  onClose: () => void;
}) {
  const groups = [...new Set(graph.nodes.map((p) => p.bg))],
    circles = [...new Set(graph.nodes.flatMap((p) => p.circles))].sort();
  return (
    <section className="map-key dock-tool" aria-labelledby="map-key-title">
      <header>
        <div>
          <span className="eyebrow">READ YOUR UNIVERSE</span>
          <h2 id="map-key-title">Map key</h2>
        </div>
        <button aria-label="Close map key" onClick={onClose}>
          ×
        </button>
      </header>
      <svg
        className="key-star"
        viewBox="0 0 260 120"
        aria-label="Example: group-colored star, category ring, closeness 4 out of 5, high agency lightning"
      >
        <defs>
          <radialGradient id="key-glow">
            <stop stopColor="#c3b5ff" stopOpacity=".5" />
            <stop offset="1" stopColor="#c3b5ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="130" cy="58" r="52" fill="url(#key-glow)" />
        <circle cx="130" cy="58" r="17" fill="#98a0ff" />
        <circle
          cx="130"
          cy="58"
          r="25"
          fill="none"
          stroke="#f4ba70"
          strokeWidth="4"
          strokeDasharray="76 81"
        />
        <circle
          cx="130"
          cy="58"
          r="25"
          fill="none"
          stroke="#65d4c4"
          strokeWidth="4"
          strokeDasharray="76 81"
          transform="rotate(180 130 58)"
        />
        <text x="154" y="42" fill="#ffdb8d" fontSize="29">
          ϟ
        </text>
        <rect
          x="146"
          y="65"
          width="22"
          height="19"
          rx="6"
          fill="#172136"
          stroke="#98a0ff"
        />
        <text x="157" y="79" textAnchor="middle" fill="white" fontSize="12">
          4
        </text>
        <text x="130" y="109" textAnchor="middle" fill="#b6c3de" fontSize="11">
          Star = group · ring = circles · number = closeness
        </text>
      </svg>
      <h3>Closeness · 1–5</h3>
      <div className="closeness-key">
        {["Just met", "Acquaintance", "Know well", "Close", "Inner circle"].map(
          (label, i) => (
            <div key={label}>
              <b>{i + 1}</b>
              <span>{label}</span>
            </div>
          ),
        )}
      </div>
      <p>
        The number is always attached to the star. Larger stars are closer to
        you; map distance is your arrangement.
      </p>
      <h3>Your judgment</h3>
      <p>
        <b>✦ Glow</b> = high signal
        <br />
        <b className="agency-mark">ϟ Lightning</b> = high agency
        <br />
        Every selected judgment gets its own symbol around the orb. Hover a
        symbol for its meaning. All judgments are yours to assign.
      </p>
      <div className="key-items">
        {JUDGMENTS.map(([key, icon, label]) => (
          <span key={key}>
            {icon} {label}
          </span>
        ))}
      </div>
      <h3>Star color · spatial group</h3>
      <div className="key-items">
        {groups.map((g) => (
          <span key={g}>
            <i style={{ background: colorFor(g) }} />
            {groupName(g, graph.bucketNames)}
          </span>
        ))}
      </div>
      <h3>Ring colors · all selected circles</h3>
      <p>
        Every circle gets a colored segment around the star. Hover a segment for
        its name; select the star to change circles.
      </p>
      <div className="key-items">
        {circles.map((c) => (
          <span key={c}>
            <i style={{ background: circleColor(c) }} />
            {circleIcon(c)} {c}
          </span>
        ))}
      </div>
      <h3>Move around</h3>
      <p>
        Groups gently settle into seeded grids, staggered rows, hexagons, or
        orbital rings. Dragging pauses settling; group membership and circles
        only change through your edits. Names shrink with zoom and try alternate
        placements before hiding.
      </p>
      <p>
        Scroll or pinch to zoom. Use the zoom slider or + / − keys. Press 0 to
        fit the map. Drag empty space to pan; drag a group boundary to move
        everyone in it.
      </p>
    </section>
  );
}

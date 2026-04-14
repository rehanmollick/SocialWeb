'use client';

type Props = { onLaunch: () => void };

export default function LandingPage({ onLaunch }: Props) {
  return (
    <div className="landing">
      <section className="hero">
        <svg className="mandala" viewBox="-200 -200 400 400" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5">
          <circle cx="0" cy="0" r="60" />
          <circle cx="0" cy="0" r="120" />
          <circle cx="0" cy="0" r="180" />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i / 12) * Math.PI * 2;
            const r = (v: number) => Number(v.toFixed(2));
            return (
              <line
                key={i}
                x1={r(Math.cos(a) * 60)}
                y1={r(Math.sin(a) * 60)}
                x2={r(Math.cos(a) * 180)}
                y2={r(Math.sin(a) * 180)}
              />
            );
          })}
          {Array.from({ length: 6 }).map((_, i) => {
            const a = (i / 6) * Math.PI * 2;
            const r = (v: number) => Number(v.toFixed(2));
            return (
              <circle
                key={`d${i}`}
                cx={r(Math.cos(a) * 120)}
                cy={r(Math.sin(a) * 120)}
                r="3"
                fill="rgba(255,255,255,0.4)"
                stroke="none"
              />
            );
          })}
        </svg>
        <div className="eyebrow">social web · v0</div>
        <h1>
          remember who <em>matters</em>
          <br />
          and why.
        </h1>
        <p className="sub">
          drop a thought. a person emerges. the graph grows. your social memory, living outside your head,
          shaped by how often you think of someone and what you think about.
        </p>
        <div className="cta-row">
          <button className="btn primary" onClick={onLaunch}>
            open the graph <span className="kbd">⌘K</span>
          </button>
          <button className="btn" onClick={onLaunch}>
            drop a thought
          </button>
        </div>
      </section>
      <section className="features">
        <div className="f">
          <span className="num">01</span>
          <h3>thought → person</h3>
          <p>type what happened. claude extracts the people, the context, the signal. nothing to fill in.</p>
        </div>
        <div className="f">
          <span className="num">02</span>
          <h3>graph as memory</h3>
          <p>every mention strengthens a node. co-mentions become edges. the picture sharpens as you use it.</p>
        </div>
        <div className="f">
          <span className="num">03</span>
          <h3>ask it anything</h3>
          <p>who do I know in SF that climbs? the graph answers. your social web, queryable.</p>
        </div>
      </section>
      <footer className="landing-footer">
        <span>© 2026 social web</span>
        <span>your graph, your machine</span>
      </footer>
    </div>
  );
}

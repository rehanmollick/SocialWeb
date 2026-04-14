'use client';

const tags = [
  { name: 'highsignal', hex: '#ffffff', desc: 'strong signal — auto at s≥8' },
  { name: 'interesting', hex: '#6ec4b4', desc: 'worth thinking about' },
  { name: 'fun', hex: '#e89999', desc: 'good hangs' },
  { name: 'friends', hex: '#8fc08f', desc: 'default connection' },
  { name: 'important', hex: '#d4a659', desc: 'load-bearing' },
  { name: 'helpful', hex: '#a897c9', desc: 'useful to know' },
  { name: 'boring', hex: '#4a4a4a', desc: 'low signal' },
];

const surfaces = [
  { token: '--bg', hex: '#0a0a0a', desc: 'near black base' },
  { token: '--bg-raised', hex: '#111111', desc: 'sidebar / panels' },
  { token: '--bg-panel', hex: '#151515', desc: 'inputs / cards' },
  { token: '--bg-hover', hex: '#1a1a1a', desc: 'hover / active' },
];

const texts = [
  { token: '--fg', hex: '#ededed', desc: 'primary text' },
  { token: '--fg-dim', hex: '#a0a0a0', desc: 'secondary' },
  { token: '--fg-muted', hex: '#666666', desc: 'muted labels' },
  { token: '--fg-faint', hex: '#3a3a3a', desc: 'hairlines' },
];

export default function TokensPage() {
  return (
    <div className="tokens">
      <h2>
        <span>01</span>tag palette
      </h2>
      <div className="tag-grid">
        {tags.map((t) => (
          <div key={t.name} className="tag-card">
            <div className="swatch" style={{ background: t.hex }} />
            <div>
              <div className="label">{t.name}</div>
              <div className="hex">{t.hex}</div>
              <div className="desc">{t.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <h2>
        <span>02</span>surfaces
      </h2>
      <div className="tag-grid">
        {surfaces.map((s) => (
          <div key={s.token} className="tag-card">
            <div className="swatch" style={{ background: s.hex, border: '1px solid rgba(255,255,255,0.1)' }} />
            <div>
              <div className="label">{s.token}</div>
              <div className="hex">{s.hex}</div>
              <div className="desc">{s.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <h2>
        <span>03</span>text
      </h2>
      <div className="tag-grid">
        {texts.map((s) => (
          <div key={s.token} className="tag-card">
            <div className="swatch" style={{ background: s.hex }} />
            <div>
              <div className="label">{s.token}</div>
              <div className="hex">{s.hex}</div>
              <div className="desc">{s.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <h2>
        <span>04</span>typography
      </h2>
      <div className="type-spec">
        <div className="type-row">
          <span className="token">display / 88 / 300</span>
          <span className="sample" style={{ fontSize: 72, fontWeight: 300, lineHeight: 0.95 }}>
            remember who <em style={{ fontStyle: 'italic', fontWeight: 200, color: 'var(--fg-dim)' }}>matters</em>
          </span>
        </div>
        <div className="type-row">
          <span className="token">h3 / 18 / 500</span>
          <span className="sample" style={{ fontSize: 18, fontWeight: 500 }}>
            thought → person
          </span>
        </div>
        <div className="type-row">
          <span className="token">body / 13 / 400</span>
          <span className="sample" style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
            drop a thought, claude extracts people, the graph grows.
          </span>
        </div>
        <div className="type-row">
          <span className="token">mono / 11 / 400</span>
          <span className="sample" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            social web · v0
          </span>
        </div>
      </div>
    </div>
  );
}

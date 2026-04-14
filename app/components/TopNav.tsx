'use client';

export type TabKey = 'landing' | 'app' | 'tokens';

type Props = {
  tab: TabKey;
  onTab: (t: TabKey) => void;
  crumb: string;
};

export default function TopNav({ tab, onTab, crumb }: Props) {
  return (
    <nav className="rail">
      <div className="wordmark">social web</div>
      <span className="sep">/</span>
      <span className="crumb active">{crumb}</span>
      <div className="spacer" />
      <div className="tabs">
        <button className={`tab ${tab === 'landing' ? 'active' : ''}`} onClick={() => onTab('landing')}>
          01 landing
        </button>
        <button className={`tab ${tab === 'app' ? 'active' : ''}`} onClick={() => onTab('app')}>
          02 app
        </button>
        <button className={`tab ${tab === 'tokens' ? 'active' : ''}`} onClick={() => onTab('tokens')}>
          03 tokens
        </button>
      </div>
      <button className="action" onClick={() => onTab('app')}>
        launch ⌘K
      </button>
    </nav>
  );
}

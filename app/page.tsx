'use client';

import { useEffect, useState } from 'react';
import TopNav, { type TabKey } from './components/TopNav';
import LandingPage from './components/LandingPage';
import AppPage from './components/AppPage';
import TokensPage from './components/TokensPage';

export default function Page() {
  const [tab, setTab] = useState<TabKey>('landing');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setTab('app');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const crumb = tab === 'landing' ? 'home' : tab === 'app' ? 'graph' : 'tokens';

  return (
    <>
      <TopNav tab={tab} onTab={setTab} crumb={crumb} />
      <main>
        <div className={`page ${tab === 'landing' ? 'active' : ''}`}>
          <LandingPage onLaunch={() => setTab('app')} />
        </div>
        <div className={`page ${tab === 'app' ? 'active' : ''}`}>
          {tab === 'app' && <AppPage />}
        </div>
        <div className={`page ${tab === 'tokens' ? 'active' : ''}`}>
          <TokensPage />
        </div>
      </main>
    </>
  );
}

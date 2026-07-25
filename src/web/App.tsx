import { useEffect, useState } from 'react';
import { GridDashboard } from './views/GridDashboard.js';
import { IsometricOffice } from './views/IsometricOffice.js';
import { ViewSwitcher, type ViewKind } from './views/ViewSwitcher.js';
import { ReplayControls } from './views/ReplayControls.js';
import { OnboardingScreen } from './views/OnboardingScreen.js';
import { SettingsScreen } from './views/SettingsScreen.js';
import { EventTicker } from './components/EventTicker.js';
import { connectWs } from './ws/eventClient.js';
import { useCharacterStore } from './store/characterStore.js';
import type { CharacterConfig } from '../shared/config.js';

export function App() {
  const connected = useCharacterStore((s) => s.connected);
  const events = useCharacterStore((s) => s.events);
  const [view, setView] = useState<ViewKind>('grid');
  const [configs, setConfigs] = useState<CharacterConfig[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem('cm-onboarding-done') === '1',
  );

  useEffect(() => {
    fetch('/config/characters').then((r) => r.json()).then(setConfigs).catch(() => setConfigs([]));
    const url = `ws://${location.hostname}:${location.port === '5173' ? '4000' : location.port || '4000'}/live`;
    const c = connectWs(url, useCharacterStore.getState);
    return () => c.close();
  }, []);

  function completeOnboarding() {
    localStorage.setItem('cm-onboarding-done', '1');
    setDismissed(true);
  }

  const showOnboarding = !dismissed && events.length === 0;

  return (
    <div>
      <header className="app-header">
        <h2 className="app-title">Claude Office Story</h2>
        <div className="app-header-right">
          <ViewSwitcher active={view} onChange={setView} />
          <button className="header-btn" onClick={() => setSettingsOpen(true)} title="팀 설정">⚙ SETUP</button>
          <span className={`conn-pill ${connected ? 'on' : ''}`}>
            {connected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </header>
      <ReplayControls />
      <main className="app-main">
        {showOnboarding ? (
          <OnboardingScreen onComplete={completeOnboarding} />
        ) : (
          view === 'grid' ? <GridDashboard configs={configs} /> : <IsometricOffice configs={configs} />
        )}
      </main>
      <EventTicker />
      {settingsOpen && (
        <SettingsScreen configs={configs} onClose={() => setSettingsOpen(false)} onSaved={setConfigs} />
      )}
    </div>
  );
}

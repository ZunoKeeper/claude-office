import { useEffect, useState } from 'react';
import { IsometricOffice } from './views/IsometricOffice.js';
import { CharacterPanel } from './views/CharacterPanel.js';
import { OnboardingScreen } from './views/OnboardingScreen.js';
import { SettingsScreen } from './views/SettingsScreen.js';
import { EventTicker } from './components/EventTicker.js';
import { CapabilityStrip } from './components/CapabilityStrip.js';
import { connectWs } from './ws/eventClient.js';
import { useCharacterStore } from './store/characterStore.js';
import type { CharacterConfig } from '../shared/config.js';

export function App() {
  const connected = useCharacterStore((s) => s.connected);
  const events = useCharacterStore((s) => s.events);
  const configVersion = useCharacterStore((s) => s.configVersion);
  const [configs, setConfigs] = useState<CharacterConfig[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem('cm-onboarding-done') === '1',
  );

  useEffect(() => {
    const url = `ws://${location.hostname}:${location.port === '5173' ? '4000' : location.port || '4000'}/live`;
    const c = connectWs(url, useCharacterStore.getState);
    return () => c.close();
  }, []);

  // Re-fetch character configs on initial mount and whenever the server
  // signals a config change (configVersion bumps on WS `configUpdated`).
  useEffect(() => {
    fetch('/config/characters').then((r) => r.json()).then(setConfigs).catch(() => setConfigs([]));
  }, [configVersion]);

  function completeOnboarding() {
    localStorage.setItem('cm-onboarding-done', '1');
    setDismissed(true);
  }

  const showOnboarding = !dismissed && events.length === 0;

  return (
    <div className="app-shell">
      <header className="app-header">
        <h2 className="app-title">Claude Office Story</h2>
        <div className="app-header-right">
          <button className="header-btn" onClick={() => setSettingsOpen(true)} title="팀 설정">⚙ SETUP</button>
          <span className={`conn-pill ${connected ? 'on' : ''}`}>
            {connected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </header>
      <main className="app-main">
        {showOnboarding ? (
          <OnboardingScreen onComplete={completeOnboarding} />
        ) : (
          <div className="office-layout">
            <CharacterPanel configs={configs} />
            <div className="office-canvas-area">
              <IsometricOffice configs={configs} />
            </div>
          </div>
        )}
      </main>
      {!showOnboarding && <CapabilityStrip configs={configs} />}
      <EventTicker />
      {settingsOpen && (
        <SettingsScreen configs={configs} onClose={() => setSettingsOpen(false)} onSaved={setConfigs} />
      )}
    </div>
  );
}

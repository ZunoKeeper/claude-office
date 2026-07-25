import { useEffect, useState } from 'react';
import { GridDashboard } from './views/GridDashboard.js';
import { IsometricOffice } from './views/IsometricOffice.js';
import { ViewSwitcher, type ViewKind } from './views/ViewSwitcher.js';
import { ReplayControls } from './views/ReplayControls.js';
import { EventTicker } from './components/EventTicker.js';
import { connectWs } from './ws/eventClient.js';
import { useCharacterStore } from './store/characterStore.js';
import type { CharacterConfig } from '../shared/config.js';

export function App() {
  const connected = useCharacterStore((s) => s.connected);
  const [view, setView] = useState<ViewKind>('grid');
  const [configs, setConfigs] = useState<CharacterConfig[]>([]);

  useEffect(() => {
    fetch('/config/characters').then((r) => r.json()).then(setConfigs).catch(() => setConfigs([]));
    const url = `ws://${location.hostname}:${location.port === '5173' ? '4000' : location.port || '4000'}/live`;
    const c = connectWs(url, useCharacterStore.getState);
    return () => c.close();
  }, []);

  return (
    <div>
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 16px', background: '#1f2937', color: 'white',
      }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Claude Monitor</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <ViewSwitcher active={view} onChange={setView} />
          <span style={{
            fontSize: 12, background: connected ? '#10b981' : '#ef4444',
            padding: '2px 8px', borderRadius: 8,
          }}>{connected ? 'connected' : 'disconnected'}</span>
        </div>
      </header>
      <ReplayControls />
      {view === 'grid' ? <GridDashboard /> : <IsometricOffice configs={configs} />}
      <EventTicker />
    </div>
  );
}

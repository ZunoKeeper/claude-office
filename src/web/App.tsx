import { useEffect } from 'react';
import { GridDashboard } from './views/GridDashboard.js';
import { connectWs } from './ws/eventClient.js';
import { useCharacterStore } from './store/characterStore.js';

export function App() {
  const connected = useCharacterStore((s) => s.connected);
  useEffect(() => {
    const url = `ws://${location.hostname}:${location.port === '5173' ? '4000' : location.port || '4000'}/live`;
    const c = connectWs(url, useCharacterStore.getState);
    return () => c.close();
  }, []);
  return (
    <div>
      <header style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '10px 16px', background: '#1f2937', color: 'white',
      }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Claude Monitor</h2>
        <span style={{
          fontSize: 12, background: connected ? '#10b981' : '#ef4444',
          padding: '2px 8px', borderRadius: 8,
        }}>{connected ? 'connected' : 'disconnected'}</span>
      </header>
      <GridDashboard />
    </div>
  );
}

import { useEffect, useState } from 'react';

interface Status { file: string | null; running: boolean; index: number; total: number }

export function ReplayControls() {
  const [file, setFile] = useState('');
  const [speed, setSpeed] = useState(10);
  const [status, setStatus] = useState<Status>({ file: null, running: false, index: 0, total: 0 });

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await fetch('/replay/status');
        if (r.ok) setStatus(await r.json());
      } catch { /* ignore */ }
    }, 1000);
    return () => clearInterval(t);
  }, []);

  async function start() {
    await fetch('/replay/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, speed }),
    });
  }

  async function stop() { await fetch('/replay/stop', { method: 'POST' }); }

  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'center',
      padding: '6px 12px', background: '#374151', color: 'white', fontSize: 12,
    }}>
      <input value={file} onChange={(e) => setFile(e.target.value)} placeholder="/path/to/session.jsonl"
             style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: 'none' }} />
      <label>속도
        <input type="number" value={speed} min={1} max={200} onChange={(e) => setSpeed(Number(e.target.value))}
               style={{ width: 60, marginLeft: 4, padding: '2px 4px' }} />
      </label>
      <button onClick={start} disabled={!file || status.running}>▶ 재생</button>
      <button onClick={stop} disabled={!status.running}>■ 정지</button>
      {status.running && <span>{status.index}/{status.total}</span>}
    </div>
  );
}

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
    <div className="replay-panel">
      <span>📼 REPLAY</span>
      <input type="text" value={file} onChange={(e) => setFile(e.target.value)}
             placeholder="/path/to/session.jsonl" />
      <label>SPD
        <input type="number" value={speed} min={1} max={200}
               onChange={(e) => setSpeed(Number(e.target.value))} />
      </label>
      <button onClick={start} disabled={!file || status.running}>▶ PLAY</button>
      <button onClick={stop} disabled={!status.running}>■ STOP</button>
      {status.running && <span>{status.index}/{status.total}</span>}
    </div>
  );
}

import { useState } from 'react';

interface Props { onComplete(): void }

export function OnboardingScreen({ onComplete }: Props) {
  const [scope, setScope] = useState<'user' | 'project'>('project');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function install() {
    setBusy(true);
    try {
      const r = await fetch(`/setup/install-hooks?scope=${scope}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: `http://${location.hostname}:4000` }),
      });
      const data = await r.json();
      setStatus(data.ok ? `설치 완료: ${data.target}` : '설치 실패');
    } catch (err) {
      setStatus(`오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      maxWidth: 560, margin: '80px auto', padding: 24,
      background: 'white', borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,.06)',
    }}>
      <h2>Claude Monitor 초기 설정</h2>
      <p>이 앱은 Claude Code hooks를 통해 이벤트를 수신합니다.</p>
      <div style={{ margin: '16px 0' }}>
        <label style={{ display: 'block', margin: '6px 0' }}>
          <input type="radio" checked={scope === 'user'} onChange={() => setScope('user')} />
          {' '}전역 (`~/.claude/settings.json`)
        </label>
        <label style={{ display: 'block', margin: '6px 0' }}>
          <input type="radio" checked={scope === 'project'} onChange={() => setScope('project')} />
          {' '}현재 프로젝트 (`.claude/settings.json`)
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={install} disabled={busy}>자동 설치</button>
        <button onClick={onComplete}>건너뛰기</button>
      </div>
      {status && <p style={{ marginTop: 12, fontSize: 13 }}>{status}</p>}
    </div>
  );
}

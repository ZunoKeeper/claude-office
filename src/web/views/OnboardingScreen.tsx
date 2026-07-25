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
      setStatus(data.ok ? `✔ 설치 완료: ${data.target}` : '✗ 설치 실패');
    } catch (err) {
      setStatus(`오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onboarding">
      <h2>▶ NEW GAME</h2>
      <p>Claude Code hooks를 설치하면 팀원들이 활동을 시작합니다.</p>
      <div>
        <label>
          <input type="radio" name="scope"
                 checked={scope === 'user'} onChange={() => setScope('user')} />
          전역 설치 (~/.claude/settings.json)
        </label>
        <label>
          <input type="radio" name="scope"
                 checked={scope === 'project'} onChange={() => setScope('project')} />
          현재 프로젝트만 (.claude/settings.json)
        </label>
      </div>
      <div className="onboarding-actions">
        <button onClick={install} disabled={busy}>{busy ? '설치 중...' : '자동 설치'}</button>
        <button onClick={onComplete}>건너뛰기</button>
      </div>
      {status && <div className="onboarding-status">{status}</div>}
    </div>
  );
}

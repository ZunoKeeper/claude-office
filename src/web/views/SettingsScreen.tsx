import { useEffect, useState } from 'react';
import type { CharacterConfig } from '../../shared/config.js';
import type { CharacterId } from '../../shared/character.js';
import { PixelAvatar } from '../components/PixelAvatar.js';

interface Props {
  configs: CharacterConfig[];
  onClose(): void;
  onSaved(next: CharacterConfig[]): void;
}

type Draft = Record<CharacterId, { name: string }>;

function toDraft(configs: CharacterConfig[]): Draft {
  const d = {} as Draft;
  for (const c of configs) d[c.id] = { name: c.name ?? '' };
  return d;
}

export function SettingsScreen({ configs, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(configs));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => { setDraft(toDraft(configs)); }, [configs]);

  function update(id: CharacterId, value: string) {
    setDraft((prev) => ({ ...prev, [id]: { name: value } }));
  }

  async function saveAll() {
    setSaving(true);
    setStatus(null);
    let changed = 0;
    let failed = 0;
    let latest: CharacterConfig[] = configs;
    try {
      for (const cfg of configs) {
        const newName = draft[cfg.id]?.name?.trim() ?? '';
        if (!newName || newName === (cfg.name ?? '')) continue;
        const r = await fetch(`/config/characters/${cfg.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName }),
        });
        if (!r.ok) { failed += 1; continue; }
        const data = await r.json();
        if (data?.character) {
          latest = latest.map((c) => (c.id === cfg.id ? data.character : c));
        }
        changed += 1;
      }
      setStatus(failed === 0 ? `${changed}건 저장 완료` : `${changed}건 저장, ${failed}건 실패`);
      onSaved(latest);
    } catch (err) {
      setStatus(`오류: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>⚙ TEAM SETUP</h2>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>
        <p className="settings-info">
          이름만 편집 가능합니다. 역할과 설명은 실제 라우팅 조건에 종속되어 <code>config/characters.json</code>에서
          관리되며, 모델은 JSONL의 <code>assistant.message.model</code>에서 자동 관측되어 카드에 표시됩니다.
        </p>

        <div className="settings-list settings-list-compact">
          {configs.map((cfg) => {
            const d = draft[cfg.id];
            if (!d) return null;
            return (
              <div key={cfg.id} className="settings-row">
                <div className="settings-avatar">
                  <PixelAvatar id={cfg.id} size={40} />
                </div>
                <div className="settings-fields">
                  <label>이름
                    <input type="text" value={d.name} onChange={(e) => update(cfg.id, e.target.value)} />
                  </label>
                  <div className="settings-locked">
                    <span className="locked-role">{cfg.role}</span>
                    {cfg.description && <span className="locked-desc">{cfg.description}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="settings-actions">
          <button className="settings-save" onClick={saveAll} disabled={saving}>
            {saving ? '저장 중...' : '💾 SAVE ALL'}
          </button>
          <button className="settings-cancel" onClick={onClose}>취소</button>
          {status && <span className="settings-status">{status}</span>}
        </div>
      </div>
    </div>
  );
}

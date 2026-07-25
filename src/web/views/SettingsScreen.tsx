import { useEffect, useState } from 'react';
import type { CharacterConfig } from '../../shared/config.js';
import type { CharacterId } from '../../shared/character.js';
import { PixelAvatar } from '../components/PixelAvatar.js';

interface Props {
  configs: CharacterConfig[];
  onClose(): void;
  onSaved(next: CharacterConfig[]): void;
}

type Draft = Record<CharacterId, Pick<CharacterConfig, 'name' | 'role' | 'model' | 'description'>>;

const MODEL_OPTIONS = ['opus', 'sonnet', 'haiku'];

function toDraft(configs: CharacterConfig[]): Draft {
  const d = {} as Draft;
  for (const c of configs) {
    d[c.id] = {
      name: c.name ?? '',
      role: c.role ?? '',
      model: c.model ?? '',
      description: c.description ?? '',
    };
  }
  return d;
}

function diff(original: CharacterConfig, draft: Draft[CharacterId]): Partial<Draft[CharacterId]> | null {
  const patch: Partial<Draft[CharacterId]> = {};
  if (draft.name !== (original.name ?? '')) patch.name = draft.name;
  if (draft.role !== (original.role ?? '')) patch.role = draft.role;
  if (draft.model !== (original.model ?? '')) patch.model = draft.model;
  if (draft.description !== (original.description ?? '')) patch.description = draft.description;
  return Object.keys(patch).length ? patch : null;
}

export function SettingsScreen({ configs, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(configs));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => { setDraft(toDraft(configs)); }, [configs]);

  function update(id: CharacterId, key: keyof Draft[CharacterId], value: string) {
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  }

  async function saveAll() {
    setSaving(true);
    setStatus(null);
    let changed = 0;
    let failed = 0;
    let latest: CharacterConfig[] = configs;
    try {
      for (const cfg of configs) {
        const patch = diff(cfg, draft[cfg.id]);
        if (!patch) continue;
        const r = await fetch(`/config/characters/${cfg.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
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
        <p className="settings-hint">각 팀원의 이름·역할·모델·설명을 편집. 저장 시 <code>~/.claude-office/overrides.json</code>에 지속됨.</p>

        <div className="settings-list">
          {configs.map((cfg) => {
            const d = draft[cfg.id];
            if (!d) return null;
            return (
              <div key={cfg.id} className="settings-row">
                <div className="settings-avatar">
                  <PixelAvatar id={cfg.id} size={48} />
                </div>
                <div className="settings-fields">
                  <div className="settings-field-row">
                    <label>이름
                      <input type="text" value={d.name}
                             onChange={(e) => update(cfg.id, 'name', e.target.value)} />
                    </label>
                    <label>역할
                      <input type="text" value={d.role}
                             onChange={(e) => update(cfg.id, 'role', e.target.value)} />
                    </label>
                    <label>모델
                      <select value={d.model}
                              onChange={(e) => update(cfg.id, 'model', e.target.value)}>
                        <option value="">(미지정)</option>
                        {MODEL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className="settings-desc-label">설명
                    <textarea rows={2} value={d.description}
                              onChange={(e) => update(cfg.id, 'description', e.target.value)} />
                  </label>
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

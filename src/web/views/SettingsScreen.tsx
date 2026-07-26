import { useEffect, useState } from 'react';
import type { CharacterConfig } from '../../shared/config.js';
import type { CharacterId } from '../../shared/character.js';
import type { AppearanceDoc, CharacterAppearance } from '../../shared/sprites.js';
import { PixelAvatar } from '../components/PixelAvatar.js';
import { AppearanceEditor } from '../components/AppearanceEditor.js';
import { setAppearances as applyAppearances, getAppearance } from '../pixi/sprites/compose.js';
import { invalidateAtlas } from '../pixi/sprites/atlas.js';
import { useCharacterStore } from '../store/characterStore.js';

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
  // 외모 조합 — 서버 문서에 없는 캐릭터는 현재 유효 외모(기본값 포함)로 채운다.
  const [appearances, setAppearancesState] = useState<AppearanceDoc>({});
  const [openAppearanceId, setOpenAppearanceId] = useState<CharacterId | null>(null);

  useEffect(() => { setDraft(toDraft(configs)); }, [configs]);

  useEffect(() => {
    fetch('/config/sprites')
      .then((r) => r.json())
      .then((doc: AppearanceDoc) => {
        const merged: AppearanceDoc = {};
        for (const cfg of configs) {
          merged[cfg.id] = doc?.[cfg.id] ?? getAppearance(cfg.id);
        }
        setAppearancesState(merged);
      })
      .catch(() => setAppearancesState({}));
    // configs가 늦게 도착해도 병합이 다시 이뤄지도록 configs에 의존
  }, [configs]);

  function update(id: CharacterId, value: string) {
    setDraft((prev) => ({ ...prev, [id]: { name: value } }));
  }

  function updateAppearance(id: CharacterId, next: CharacterAppearance) {
    setAppearancesState((prev) => ({ ...prev, [id]: next }));
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

      // 외모 문서 저장 — 성공 시 로컬 합성 상태에 즉시 반영
      if (Object.keys(appearances).length > 0) {
        const r = await fetch('/config/sprites', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(appearances),
        });
        if (r.ok) {
          applyAppearances(appearances);
          invalidateAtlas();
          useCharacterStore.getState().bumpSpritesVersion();
          changed += 1;
        } else {
          failed += 1;
        }
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
          이름과 외모(스프라이트 조합)를 편집할 수 있습니다. 역할과 설명은 실제 라우팅 조건에 종속되어
          <code>config/characters.json</code>에서 관리되며, 모델은 JSONL의 <code>assistant.message.model</code>에서
          자동 관측되어 카드에 표시됩니다.
        </p>

        <div className="settings-list settings-list-compact">
          {configs.map((cfg) => {
            const d = draft[cfg.id];
            if (!d) return null;
            const appearance = appearances[cfg.id];
            const open = openAppearanceId === cfg.id;
            return (
              <div key={cfg.id} className="settings-row-group">
                <div className="settings-row">
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
                    <button
                      type="button"
                      className={`appearance-toggle ${open ? 'active' : ''}`}
                      onClick={() => setOpenAppearanceId(open ? null : cfg.id)}
                      disabled={!appearance}
                    >
                      {open ? '▲ 외모 닫기' : '▼ 외모 편집'}
                    </button>
                  </div>
                </div>
                {open && appearance && (
                  <AppearanceEditor
                    value={appearance}
                    onChange={(next) => updateAppearance(cfg.id, next)}
                  />
                )}
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

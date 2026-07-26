import { useState } from 'react';
import { useCharacterStore } from '../store/characterStore.js';
import { CharacterCard } from '../components/CharacterCard.js';
import { PixelAvatar } from '../components/PixelAvatar.js';
import { ALL_CHARACTER_IDS, type CharacterId, type CharacterState } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';

function empty(id: CharacterId): CharacterState {
  return { id, status: 'idle', queue: [], stats: { tasksCompleted: 0, toolCallsTotal: 0, errorsCount: 0 } };
}

/**
 * 오피스 캔버스 오른쪽 상시 패널 — 캐릭터별 컴팩트 카드 세로 나열.
 * 컴팩트 카드를 클릭하면 그 자리에서 기존 CharacterCard 전체가 펼쳐진다.
 */
export function CharacterPanel({ configs }: { configs: CharacterConfig[] }) {
  const characters = useCharacterStore((s) => s.characters);
  const [expanded, setExpanded] = useState<ReadonlySet<CharacterId>>(new Set());
  const configById = new Map(configs.map((c) => [c.id, c]));

  function toggle(id: CharacterId) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <aside className="character-panel">
      {ALL_CHARACTER_IDS.map((id) => {
        const cfg = configById.get(id);
        const state = characters[id] ?? empty(id);
        const isOpen = expanded.has(id);
        return (
          <div key={id} className="panel-entry" onClick={() => toggle(id)}>
            {isOpen ? (
              <CharacterCard
                state={state}
                name={cfg?.name ?? id}
                role={cfg?.role ?? ''}
                description={cfg?.description}
              />
            ) : (
              <CompactCard state={state} name={cfg?.name ?? id} />
            )}
          </div>
        );
      })}
    </aside>
  );
}

function CompactCard({ state, name }: { state: CharacterState; name: string }) {
  return (
    <div className={`compact-card status-${state.status}`}>
      <PixelAvatar id={state.id} size={28} />
      <span className="compact-name">{name}</span>
      <span className="compact-activity">
        {state.currentActivity
          ? `${state.currentActivity.toolName}: ${state.currentActivity.label}`
          : '대기 중'}
      </span>
      {state.queue.length > 0 && (
        <span className="compact-queue" title="큐 티켓 개수">{state.queue.length}</span>
      )}
      <span className="compact-status-dot" title={state.status} />
    </div>
  );
}

import { useCharacterStore } from '../store/characterStore.js';
import { CharacterCard } from '../components/CharacterCard.js';
import { ALL_CHARACTER_IDS, type CharacterId, type CharacterState } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';

function empty(id: CharacterId): CharacterState {
  return { id, status: 'idle', queue: [], stats: { tasksCompleted: 0, toolCallsTotal: 0, errorsCount: 0 } };
}

/**
 * 오피스 캔버스 상단 상시 패널 — 캐릭터 전체 카드를 가로로 나열한다.
 */
export function CharacterPanel({ configs }: { configs: CharacterConfig[] }) {
  const characters = useCharacterStore((s) => s.characters);
  const configById = new Map(configs.map((c) => [c.id, c]));

  return (
    <aside className="character-panel">
      {ALL_CHARACTER_IDS.map((id) => {
        const cfg = configById.get(id);
        return (
          <CharacterCard
            key={id}
            state={characters[id] ?? empty(id)}
            name={cfg?.name ?? id}
            role={cfg?.role ?? ''}
            description={cfg?.description}
          />
        );
      })}
    </aside>
  );
}

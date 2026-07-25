import { useCharacterStore } from '../store/characterStore.js';
import { TicketQueue } from '../components/TicketQueue.js';
import { ALL_CHARACTER_IDS, type CharacterState } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';

function empty(id: CharacterState['id']): CharacterState {
  return { id, status: 'off', queue: [], stats: { tasksCompleted: 0, toolCallsTotal: 0, errorsCount: 0 } };
}

/**
 * HTML overlay above the office canvas — ticket queue chips only.
 * Speech bubbles render inside CharacterSprite (Pixi) so they follow the
 * character. Since the office image sits in screen space, seat coords are
 * used directly for chip placement.
 */
export function OfficeOverlay({ configs }: { configs: CharacterConfig[] }) {
  const characters = useCharacterStore((s) => s.characters);
  const cfgMap = new Map(configs.map((c) => [c.id, c]));
  return (
    <>
      {ALL_CHARACTER_IDS.map((id) => {
        const s = characters[id] ?? empty(id);
        const cfg = cfgMap.get(id);
        if (!cfg) return null;
        if (s.queue.length === 0) return null;
        return (
          <div key={id} style={{
            position: 'absolute',
            left: cfg.officeSeat.x - 60,
            top: cfg.officeSeat.y + 8,
            width: 120, pointerEvents: 'none',
          }}>
            <TicketQueue tickets={s.queue} />
          </div>
        );
      })}
    </>
  );
}

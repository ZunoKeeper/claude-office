import { useCharacterStore } from '../store/characterStore.js';
import { TicketQueue } from '../components/TicketQueue.js';
import { ALL_CHARACTER_IDS, type CharacterState } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';
import { worldToScreen } from '../pixi/isometric.js';

function empty(id: CharacterState['id']): CharacterState {
  return { id, status: 'off', queue: [], stats: { tasksCompleted: 0, toolCallsTotal: 0, errorsCount: 0 } };
}

/**
 * HTML overlay above the isometric canvas — carries ticket queue chips only.
 * Speech bubbles are rendered inside CharacterSprite (Pixi) so they follow
 * characters as they walk between rooms.
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
        const iso = worldToScreen(cfg.officeSeat.x, cfg.officeSeat.y);
        return (
          <div key={id} style={{
            position: 'absolute',
            left: iso.x - 60,
            top: iso.y + 8,
            width: 120, pointerEvents: 'none',
          }}>
            <TicketQueue tickets={s.queue} />
          </div>
        );
      })}
    </>
  );
}

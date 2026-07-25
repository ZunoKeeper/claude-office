import { useCharacterStore } from '../store/characterStore.js';
import { SpeechBubble } from '../components/SpeechBubble.js';
import { TicketQueue } from '../components/TicketQueue.js';
import { ALL_CHARACTER_IDS, type CharacterState } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';

function empty(id: CharacterState['id']): CharacterState {
  return { id, status: 'off', queue: [], stats: { tasksCompleted: 0, toolCallsTotal: 0, errorsCount: 0 } };
}

export function OfficeOverlay({ configs }: { configs: CharacterConfig[] }) {
  const characters = useCharacterStore((s) => s.characters);
  const cfgMap = new Map(configs.map((c) => [c.id, c]));
  return (
    <>
      {ALL_CHARACTER_IDS.map((id) => {
        const s = characters[id] ?? empty(id);
        const cfg = cfgMap.get(id);
        if (!cfg) return null;
        return (
          <div key={id} style={{
            position: 'absolute', left: cfg.officeSeat.x - 60, top: cfg.officeSeat.y - 90,
            width: 140, pointerEvents: 'none',
          }}>
            {s.lastLine && (
              <div style={{ pointerEvents: 'auto' }}>
                <SpeechBubble text={s.lastLine.text} ts={s.lastLine.ts} ttlMs={s.lastLine.ttlMs} />
              </div>
            )}
            <div style={{ marginTop: 4 }}>
              <TicketQueue tickets={s.queue} />
            </div>
          </div>
        );
      })}
    </>
  );
}

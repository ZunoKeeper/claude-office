import type { CharacterId, CharacterState } from '../../shared/character.js';
import { StatusBadge } from './StatusBadge.js';
import { SpeechBubble } from './SpeechBubble.js';
import { TicketQueue } from './TicketQueue.js';

const TINT_VAR: Record<CharacterId, string> = {
  'kim-team-lead': 'var(--tint-kim)',
  'park-planner': 'var(--tint-park)',
  'lee-researcher': 'var(--tint-lee)',
  'yu-dev': 'var(--tint-yu)',
  'han-qa': 'var(--tint-han)',
  'seo-designer': 'var(--tint-seo)',
  'jo-senior': 'var(--tint-jo)',
  'jung-newbie': 'var(--tint-jung)',
  'choi-office': 'var(--tint-choi)',
};

interface Props { state: CharacterState; name: string; role: string }

export function CharacterCard({ state, name, role }: Props) {
  return (
    <div className={`desk ${state.status === 'error' ? 'error' : ''}`}>
      <div className="desk-header">
        <div className="desk-name-block">
          <div className="sprite" style={{ color: TINT_VAR[state.id] }}>
            <div className="sprite-body" />
            <div className="sprite-face">
              <div className="sprite-eyes" />
            </div>
          </div>
          <div className="desk-title">
            <span className="name">{name}</span>
            <span className="role">{role}</span>
          </div>
        </div>
        <StatusBadge status={state.status} />
      </div>

      {state.currentActivity && (
        <div className="activity">
          {state.currentActivity.toolName}: {state.currentActivity.label}
        </div>
      )}

      {state.lastLine && (
        <SpeechBubble text={state.lastLine.text} ts={state.lastLine.ts} ttlMs={state.lastLine.ttlMs} />
      )}

      <TicketQueue tickets={state.queue} />

      <div className="stats">
        <span className="stat-queue">{state.queue.length}</span>
        <span className="stat-done">{state.stats.tasksCompleted}</span>
        <span className="stat-calls">{state.stats.toolCallsTotal}</span>
        <span className="stat-err">{state.stats.errorsCount}</span>
      </div>
    </div>
  );
}

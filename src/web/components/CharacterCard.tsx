import type { CharacterState } from '../../shared/character.js';
import { StatusBadge } from './StatusBadge.js';
import { SpeechBubble } from './SpeechBubble.js';
import { TicketQueue } from './TicketQueue.js';

interface Props { state: CharacterState; name: string; role: string }

export function CharacterCard({ state, name, role }: Props) {
  return (
    <div style={{
      background: 'white', borderRadius: 8, padding: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,.08)', minHeight: 140,
      border: state.status === 'error' ? '2px solid #ef4444' : '1px solid transparent',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700 }}>{name}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>{role}</div>
        </div>
        <StatusBadge status={state.status} />
      </div>
      {state.currentActivity && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#374151' }}>
          ▶ {state.currentActivity.toolName}: {state.currentActivity.label}
        </div>
      )}
      {state.lastLine && (
        <SpeechBubble text={state.lastLine.text} ts={state.lastLine.ts} ttlMs={state.lastLine.ttlMs} />
      )}
      <div style={{ marginTop: 10, fontSize: 11, color: '#6b7280' }}>
        <TicketQueue tickets={state.queue} />
        <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
          <span>✓ {state.stats.tasksCompleted}</span>
          <span>✗ {state.stats.errorsCount}</span>
        </div>
      </div>
    </div>
  );
}

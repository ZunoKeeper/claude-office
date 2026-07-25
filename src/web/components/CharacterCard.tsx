import type { CharacterState } from '../../shared/character.js';
import { StatusBadge } from './StatusBadge.js';

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
        <div style={{
          marginTop: 8, background: '#f3f4f6', padding: '6px 10px', borderRadius: 6,
          fontSize: 13, fontStyle: 'italic',
        }}>💬 {state.lastLine.text}</div>
      )}
      <div style={{ marginTop: 10, display: 'flex', gap: 12, fontSize: 11, color: '#6b7280' }}>
        <span>🎫 {state.queue.length}</span>
        <span>✓ {state.stats.tasksCompleted}</span>
        <span>✗ {state.stats.errorsCount}</span>
      </div>
    </div>
  );
}

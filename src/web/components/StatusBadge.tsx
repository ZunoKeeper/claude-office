import type { CharacterStatus } from '../../shared/character.js';

const LABELS: Record<CharacterStatus, string> = {
  off: 'OFF',
  idle: 'IDLE',
  thinking: 'THINK',
  working: 'BUSY',
  blocked: 'WAIT',
  error: 'ERR!',
  done: 'DONE',
};

export function StatusBadge({ status }: { status: CharacterStatus }) {
  return <span className={`badge ${status}`}>{LABELS[status]}</span>;
}

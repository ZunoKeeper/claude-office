import type { CharacterStatus } from '../../shared/character.js';

const COLORS: Record<CharacterStatus, string> = {
  off: '#9ca3af', idle: '#6b7280', thinking: '#3b82f6',
  working: '#10b981', blocked: '#f59e0b', error: '#ef4444', done: '#22c55e',
};

const LABELS: Record<CharacterStatus, string> = {
  off: '미출근', idle: '대기', thinking: '생각중', working: '작업중',
  blocked: '대기중', error: '오류', done: '완료',
};

export function StatusBadge({ status }: { status: CharacterStatus }) {
  return (
    <span style={{
      background: COLORS[status], color: 'white', padding: '2px 8px',
      borderRadius: 12, fontSize: 12, fontWeight: 600,
    }}>{LABELS[status]}</span>
  );
}

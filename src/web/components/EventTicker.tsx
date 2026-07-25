import { useCharacterStore } from '../store/characterStore.js';

export function EventTicker() {
  const events = useCharacterStore((s) => s.events);
  const last = events[events.length - 1];
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, background: '#111827',
      color: '#f9fafb', fontSize: 12, padding: '6px 14px', fontFamily: 'monospace',
    }}>
      {last ? `[${new Date(last.ts).toLocaleTimeString('ko-KR')}] ${last.type}` : '이벤트 대기중...'}
    </div>
  );
}

import { useCharacterStore } from '../store/characterStore.js';

export function EventTicker() {
  const events = useCharacterStore((s) => s.events);
  const last = events[events.length - 1];
  return (
    <div className="event-ticker">
      {last ? `[${new Date(last.ts).toLocaleTimeString('ko-KR')}] ${last.type}` : 'STANDBY...'}
    </div>
  );
}

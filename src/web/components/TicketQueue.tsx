import type { Ticket } from '../../shared/character.js';

export function TicketQueue({ tickets }: { tickets: Ticket[] }) {
  const shown = tickets.slice(0, 5);
  const extra = tickets.length - shown.length;
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginTop: 6 }}>
      {shown.map((t) => (
        <span key={t.ticketId} title={t.label} style={{
          background: t.status === 'active' ? '#10b981' : '#e5e7eb',
          width: 12, height: 16, borderRadius: 2, display: 'inline-block',
        }} />
      ))}
      {extra > 0 && <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 4 }}>+{extra}</span>}
    </div>
  );
}

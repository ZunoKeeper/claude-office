import type { Ticket } from '../../shared/character.js';

export function TicketQueue({ tickets }: { tickets: Ticket[] }) {
  if (tickets.length === 0) return <div className="tickets" />;
  const shown = tickets.slice(0, 5);
  const extra = tickets.length - shown.length;
  return (
    <div className="tickets">
      {shown.map((t) => (
        <span key={t.ticketId} title={t.label} className={`ticket ${t.status}`} />
      ))}
      {extra > 0 && <span className="ticket-more">+{extra}</span>}
    </div>
  );
}

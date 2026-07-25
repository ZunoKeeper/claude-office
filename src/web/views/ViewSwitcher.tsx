export type ViewKind = 'grid' | 'office';

export function ViewSwitcher({ active, onChange }: { active: ViewKind; onChange(v: ViewKind): void }) {
  return (
    <div className="view-switcher">
      {(['grid', 'office'] as ViewKind[]).map((v) => (
        <button key={v} onClick={() => onChange(v)}
          className={`view-btn ${active === v ? 'active' : ''}`}>
          {v === 'grid' ? 'GRID' : 'OFFICE'}
        </button>
      ))}
    </div>
  );
}

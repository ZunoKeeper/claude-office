export type ViewKind = 'grid' | 'office';

export function ViewSwitcher({ active, onChange }: { active: ViewKind; onChange(v: ViewKind): void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {(['grid', 'office'] as ViewKind[]).map((v) => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding: '4px 10px', border: 'none', borderRadius: 4, fontSize: 12,
          background: active === v ? '#10b981' : '#374151', color: 'white', cursor: 'pointer',
        }}>{v === 'grid' ? 'Grid' : 'Office'}</button>
      ))}
    </div>
  );
}

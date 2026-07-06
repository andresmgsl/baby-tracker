export type TabId = 'home' | 'history' | 'growth' | 'settings'

const TABS: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'history', label: 'History' },
  { id: 'growth', label: 'Growth' },
  { id: 'settings', label: 'Settings' },
]

export function BottomTabs({
  active,
  onChange,
}: {
  active: TabId
  onChange: (t: TabId) => void
}) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={t.id === active ? 'active' : ''}
          aria-label={t.label}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}

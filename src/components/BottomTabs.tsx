export type TabId = 'home' | 'history' | 'growth' | 'settings'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '🍼' },
  { id: 'history', label: 'History', icon: '📜' },
  { id: 'growth', label: 'Growth', icon: '📈' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
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
          <span className="ic">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}

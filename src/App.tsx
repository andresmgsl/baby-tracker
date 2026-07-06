import { useState } from 'react'
import { BottomTabs, type TabId } from './components/BottomTabs'
import { Home } from './components/home/Home'
import { LogSheet } from './components/home/LogSheet'
import type { LogTarget } from './components/home/QuickLogGrid'
import { Growth } from './components/growth/Growth'
import { History } from './components/history/History'
import { EditEntrySheet } from './components/history/EditEntrySheet'
import { Settings } from './components/settings/Settings'
import type { Entry } from './db/types'

export default function App() {
  const [tab, setTab] = useState<TabId>('home')
  const [target, setTarget] = useState<LogTarget | 'note' | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [editing, setEditing] = useState<Entry | null>(null)
  const today = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <div className="app">
      <header className="masthead">
        <span className="mast-word">BABY<i>LOG</i></span>
        <span className="mast-date">{today}</span>
      </header>
      <main className="app-main">
        {tab === 'home' && (
          <Home key={refreshKey} onLog={setTarget} onSelectEntry={setEditing} />
        )}
        {tab === 'growth' && <Growth />}
        {tab === 'history' && <History key={refreshKey} onEdit={setEditing} />}
        {tab === 'settings' && <Settings />}
      </main>
      <BottomTabs active={tab} onChange={setTab} />
      <LogSheet
        target={target}
        onClose={() => setTarget(null)}
        onSaved={() => { setTarget(null); setRefreshKey((k) => k + 1) }}
      />
      <EditEntrySheet
        entry={editing}
        onClose={() => setEditing(null)}
        onChanged={() => { setEditing(null); setRefreshKey((k) => k + 1) }}
      />
    </div>
  )
}

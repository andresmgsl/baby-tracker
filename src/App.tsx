import { useState, useEffect } from 'react'
import { BottomTabs, type TabId } from './components/BottomTabs'
import { Home } from './components/home/Home'
import { LogSheet } from './components/home/LogSheet'
import { SleepSession } from './components/home/SleepSession'
import { BreastSession } from './components/home/BreastSession'
import type { LogTarget } from './components/home/QuickLogGrid'
import { Growth } from './components/growth/Growth'
import { History } from './components/history/History'
import { EditEntrySheet } from './components/history/EditEntrySheet'
import { Settings } from './components/settings/Settings'
import type { Entry } from './db/types'
import { useLiveSync } from './state/useLiveSync'
import { useActiveBaby } from './state/ActiveBabyContext'
import { FirstBabyScreen } from './components/babies/FirstBabyScreen'

export default function App() {
  const [tab, setTab] = useState<TabId>('home')
  const [target, setTarget] = useState<LogTarget | 'note' | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [editing, setEditing] = useState<Entry | null>(null)
  const [sleepOpen, setSleepOpen] = useState(false)
  const [breastOpen, setBreastOpen] = useState(false)
  const { active, loading: babyLoading, activeId } = useActiveBaby()
  const today = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  useLiveSync(() => setRefreshKey((k) => k + 1))
  useEffect(() => { setRefreshKey((k) => k + 1) }, [activeId])
  if (babyLoading) return <div className="app" />
  if (!active) return <div className="app"><FirstBabyScreen /></div>
  return (
    <div className="app">
      <header className="masthead">
        <span className="mast-word">BABY<i>LOG</i></span>
        <span className="mast-date">{today}</span>
      </header>
      <main className="app-main">
        {tab === 'home' && (
          <Home
            key={refreshKey}
            onLog={setTarget}
            onSelectEntry={setEditing}
            onOpenSleep={() => setSleepOpen(true)}
            onOpenBreast={() => setBreastOpen(true)}
            onSeeAll={() => setTab('history')}
          />
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
      {sleepOpen && (
        <SleepSession
          syncSignal={refreshKey}
          onClose={() => setSleepOpen(false)}
          onCommitted={() => { setSleepOpen(false); setRefreshKey((k) => k + 1) }}
        />
      )}
      {breastOpen && (
        <BreastSession
          syncSignal={refreshKey}
          onClose={() => setBreastOpen(false)}
          onCommitted={() => { setBreastOpen(false); setRefreshKey((k) => k + 1) }}
        />
      )}
    </div>
  )
}

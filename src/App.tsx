import { useState } from 'react'
import { BottomTabs, type TabId } from './components/BottomTabs'
import { Home } from './components/home/Home'
import { LogSheet } from './components/home/LogSheet'
import type { LogTarget } from './components/home/QuickLogGrid'

export default function App() {
  const [tab, setTab] = useState<TabId>('home')
  const [target, setTarget] = useState<LogTarget | 'note' | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  return (
    <div className="app">
      <main className="app-main">
        {tab === 'home' && (
          <Home key={refreshKey} onLog={setTarget} onSelectEntry={() => {}} />
        )}
        {tab !== 'home' && <h2 style={{ textTransform: 'capitalize' }}>{tab}</h2>}
      </main>
      <BottomTabs active={tab} onChange={setTab} />
      <LogSheet
        target={target}
        onClose={() => setTarget(null)}
        onSaved={() => { setTarget(null); setRefreshKey((k) => k + 1) }}
      />
    </div>
  )
}

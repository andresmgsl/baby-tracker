import { useState } from 'react'
import { BottomTabs, type TabId } from './components/BottomTabs'
import { Home } from './components/home/Home'

export default function App() {
  const [tab, setTab] = useState<TabId>('home')
  return (
    <div className="app">
      <main className="app-main">
        {tab === 'home' && <Home onLog={() => {}} onSelectEntry={() => {}} />}
        {tab !== 'home' && <h2 style={{ textTransform: 'capitalize' }}>{tab}</h2>}
      </main>
      <BottomTabs active={tab} onChange={setTab} />
    </div>
  )
}

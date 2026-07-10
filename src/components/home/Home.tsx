import { useEffect, useMemo, useState } from 'react'
import { useDb } from '../../db/client'
import { useEntries } from '../../state/useEntries'
import { useActiveTimer } from '../../state/useActiveTimer'
import { lastEntryByType } from '../../db/queries'
import { computeDailyTotals } from '../../lib/totals'
import { startOfDay, endOfDay } from '../../lib/time'
import type { Entry, EntryType } from '../../db/types'
import { QuickLogGrid, type LogTarget } from './QuickLogGrid'
import { TotalsStrip } from './TotalsStrip'
import { Timeline } from './Timeline'
import { TimerBanner } from './TimerBanner'
import { InstallBanner } from './InstallBanner'
import { dayGroups } from './dayGroups'
import { TimelineFilter, filterEntries } from './TimelineFilter'

const LAST_TYPES: EntryType[] = ['breast', 'bottle', 'sleep', 'diaper', 'solids', 'meds']
const DAY = 86_400_000

export function Home({
  onLog, onSelectEntry, onOpenSleep, onOpenBreast, onSeeAll,
}: {
  onLog: (t: LogTarget) => void
  onSelectEntry: (e: Entry) => void
  onOpenSleep: () => void
  onOpenBreast: () => void
  onSeeAll: () => void
}) {
  const db = useDb()
  const now = Date.now()
  const { entries } = useEntries(startOfDay(now - 2 * DAY), endOfDay(now))
  const { timer, elapsed } = useActiveTimer()
  const [lasts, setLasts] = useState<Partial<Record<LogTarget, number>>>({})
  const [selected, setSelected] = useState<Set<EntryType>>(new Set())

  const todayStart = startOfDay(now)
  const totals = useMemo(
    () => computeDailyTotals(entries, todayStart, endOfDay(now)),
    [entries, todayStart, now],
  )
  const groups = useMemo(() => dayGroups(filterEntries(entries, selected), now), [entries, selected, now])

  useEffect(() => {
    void (async () => {
      const out: Partial<Record<LogTarget, number>> = {}
      for (const t of LAST_TYPES) {
        const last = await lastEntryByType(db, t)
        if (last) out[t] = last.start_ts
      }
      setLasts(out)
    })()
  }, [db, entries])

  function toggle(t: EntryType) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  return (
    <div>
      <InstallBanner />
      {timer && (
        <TimerBanner
          timer={timer}
          elapsed={elapsed}
          onStop={timer.type === 'sleep' ? onOpenSleep : onOpenBreast}
        />
      )}
      <QuickLogGrid
        lasts={lasts}
        onLog={(t) => (t === 'sleep' ? onOpenSleep() : t === 'breast' ? onOpenBreast() : onLog(t))}
        now={now}
      />
      <div className="more-row">
        <button className="btn-link" onClick={() => onLog('measure')}>📏 Measure</button>
        <button className="btn-link" onClick={() => onLog('temperature')}>🌡️ Temp</button>
        <button className="btn-link" onClick={() => onLog('note')}>📝 Note</button>
      </div>
      <div className="sectlbl">Today</div>
      <TotalsStrip totals={totals} />
      <div className="sectlbl">Timeline</div>
      <TimelineFilter selected={selected} onToggle={toggle} />
      {groups.length === 0 && (
        <p className="muted">
          {selected.size > 0 ? 'No entries match this filter.' : 'No entries in the last 3 days.'}
        </p>
      )}
      {groups.map((g) => (
        <div key={g.key}>
          <div className="daylbl">{g.label}</div>
          <Timeline entries={g.entries} onSelect={onSelectEntry} />
        </div>
      ))}
      <button className="btn-link seeall" onClick={onSeeAll}>See all →</button>
    </div>
  )
}

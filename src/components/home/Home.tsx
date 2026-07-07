import { useEffect, useMemo, useState } from 'react'
import { useDb } from '../../db/client'
import { useEntries } from '../../state/useEntries'
import { useActiveTimer } from '../../state/useActiveTimer'
import { lastEntryByType, clearTimer, insertEntry } from '../../db/queries'
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
  onLog, onSelectEntry, onOpenSleep, onSeeAll,
}: {
  onLog: (t: LogTarget) => void
  onSelectEntry: (e: Entry) => void
  onOpenSleep: () => void
  onSeeAll: () => void
}) {
  const db = useDb()
  const now = Date.now()
  const { entries, reload } = useEntries(startOfDay(now - 2 * DAY), endOfDay(now))
  const { timer, elapsed, refresh } = useActiveTimer()
  const [lasts, setLasts] = useState<Partial<Record<LogTarget, number>>>({})
  const [selected, setSelected] = useState<Set<EntryType>>(new Set())

  const todayStart = startOfDay(now)
  const todayEntries = useMemo(() => entries.filter((e) => e.start_ts >= todayStart), [entries, todayStart])
  const totals = useMemo(() => computeDailyTotals(todayEntries), [todayEntries])
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

  async function stopTimer() {
    if (!timer) return
    await insertEntry(db, {
      type: timer.type, start_ts: timer.start_ts, end_ts: Date.now(), side: timer.side,
      amount_ml: null, milk_type: null, food: null, diaper_kind: null,
      med_name: null, med_dose: null, note: null, photo_id: null,
    })
    await clearTimer(db, timer.type)
    await refresh()
    await reload()
  }

  return (
    <div>
      <InstallBanner />
      {timer && (
        <TimerBanner
          timer={timer}
          elapsed={elapsed}
          onStop={timer.type === 'sleep' ? onOpenSleep : stopTimer}
        />
      )}
      <QuickLogGrid
        lasts={lasts}
        onLog={(t) => (t === 'sleep' ? onOpenSleep() : onLog(t))}
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

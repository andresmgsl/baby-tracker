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

const LAST_TYPES: EntryType[] = ['breast', 'bottle', 'sleep', 'diaper', 'solids', 'meds']

export function Home({
  onLog, onSelectEntry,
}: {
  onLog: (t: LogTarget) => void
  onSelectEntry: (e: Entry) => void
}) {
  const db = useDb()
  const now = Date.now()
  const { entries, reload } = useEntries(startOfDay(now), endOfDay(now))
  const { timer, elapsed, refresh } = useActiveTimer()
  const [lasts, setLasts] = useState<Partial<Record<LogTarget, number>>>({})
  const totals = useMemo(() => computeDailyTotals(entries), [entries])

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
      {timer && <TimerBanner timer={timer} elapsed={elapsed} onStop={stopTimer} />}
      <QuickLogGrid lasts={lasts} onLog={onLog} now={now} />
      <div className="more-row">
        <button className="btn-link" onClick={() => onLog('measure')}>📏 Measure</button>
        <button className="btn-link" onClick={() => onLog('temperature')}>🌡️ Temp</button>
        <button className="btn-link" onClick={() => onLog('note')}>📝 Note</button>
      </div>
      <div className="sectlbl">Today</div>
      <TotalsStrip totals={totals} />
      <div className="sectlbl">Timeline</div>
      <Timeline entries={entries} onSelect={onSelectEntry} />
    </div>
  )
}

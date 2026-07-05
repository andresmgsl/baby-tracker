import { useEffect, useMemo, useState } from 'react'
import { useDb } from '../../db/client'
import { listEntries } from '../../db/queries'
import type { Entry, EntryType } from '../../db/types'
import { entryLabel } from '../home/entryLabel'
import { formatClock } from '../../lib/time'

const FILTERS: ('all' | EntryType)[] = ['all', 'breast', 'bottle', 'solids', 'sleep', 'diaper', 'meds', 'note']

function dayKey(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function History({ onEdit }: { onEdit: (e: Entry) => void }) {
  const db = useDb()
  const [filter, setFilter] = useState<'all' | EntryType>('all')
  const [rows, setRows] = useState<Entry[]>([])

  useEffect(() => {
    void (async () => setRows(await listEntries(db, filter === 'all' ? {} : { type: filter })))()
  }, [db, filter])

  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const e of rows) {
      const k = dayKey(e.start_ts)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(e)
    }
    return [...map.entries()]
  }, [rows])

  return (
    <div>
      <label className="filter-row">
        <span className="sectlbl">Filter</span>
        <select aria-label="filter" value={filter} onChange={(e) => setFilter(e.target.value as 'all' | EntryType)}>
          {FILTERS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>
      {groups.length === 0 && <p className="muted">No entries.</p>}
      {groups.map(([day, items]) => (
        <div key={day}>
          <div className="sectlbl">{day}</div>
          <div className="tl">
            {items.map((e) => {
              const { icon, text } = entryLabel(e)
              return (
                <button key={e.id} className="row" onClick={() => onEdit(e)}>
                  <span className="tm">{formatClock(e.start_ts)}</span>
                  <span className="dot">{icon}</span>
                  <span>{text}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

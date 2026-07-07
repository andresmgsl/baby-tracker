import { useEffect, useMemo, useState } from 'react'
import { useDb } from '../../db/client'
import { listEntries } from '../../db/queries'
import type { Entry, EntryType } from '../../db/types'
import { entryLabel } from '../home/entryLabel'
import { TimelineFilter, filterEntries } from '../home/TimelineFilter'
import { formatClock } from '../../lib/time'

function dayKey(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export function History({ onEdit }: { onEdit: (e: Entry) => void }) {
  const db = useDb()
  const [selected, setSelected] = useState<Set<EntryType>>(new Set())
  const [rows, setRows] = useState<Entry[]>([])

  useEffect(() => {
    void (async () => setRows(await listEntries(db, {})))()
  }, [db])

  function toggle(t: EntryType) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const e of filterEntries(rows, selected)) {
      const k = dayKey(e.start_ts)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(e)
    }
    return [...map.entries()]
  }, [rows, selected])

  return (
    <div>
      <div className="sectlbl">Filter</div>
      <TimelineFilter selected={selected} onToggle={toggle} />
      {groups.length === 0 && (
        <p className="muted">{selected.size > 0 ? 'No entries match this filter.' : 'No entries.'}</p>
      )}
      {groups.map(([day, items]) => (
        <div key={day}>
          <div className="sectlbl">{day}</div>
          <div className="tl">
            {items.map((e) => {
              const { icon, text } = entryLabel(e)
              return (
                <button key={e.id} className="row" data-type={e.type} onClick={() => onEdit(e)}>
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

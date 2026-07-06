import type { Entry } from '../../db/types'
import { formatClock } from '../../lib/time'
import { entryLabel } from './entryLabel'

export function Timeline({ entries, onSelect }: { entries: Entry[]; onSelect: (e: Entry) => void }) {
  if (entries.length === 0) return <p className="muted">No entries yet today.</p>
  return (
    <div className="tl">
      {entries.map((e) => {
        const { icon, text } = entryLabel(e)
        return (
          <button key={e.id} className="row" data-type={e.type} onClick={() => onSelect(e)}>
            <span className="tm">{formatClock(e.start_ts)}</span>
            <span className="dot">{icon}</span>
            <span>{text}</span>
          </button>
        )
      })}
    </div>
  )
}

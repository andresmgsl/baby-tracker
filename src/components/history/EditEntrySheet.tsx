import { useState } from 'react'
import { useDb } from '../../db/client'
import { updateEntry, deleteEntry, type NewEntry } from '../../db/queries'
import type { Entry } from '../../db/types'
import { deriveSide } from '../../lib/breast'
import { formatDuration } from '../../lib/time'
import { TimeField, SheetButtons } from '../home/forms/formKit'
import { entryLabel } from '../home/entryLabel'

const TYPE_NAME: Record<Entry['type'], string> = {
  breast: 'Nursing', sleep: 'Sleep', bottle: 'Bottle', solids: 'Solids',
  diaper: 'Diaper', meds: 'Meds', note: 'Note',
}

export function EditEntrySheet({
  entry, onClose, onChanged,
}: {
  entry: Entry | null
  onClose: () => void
  onChanged: () => void
}) {
  if (!entry) return null
  return <EditBody entry={entry} onClose={onClose} onChanged={onChanged} />
}

function EditBody({ entry, onClose, onChanged }: { entry: Entry; onClose: () => void; onChanged: () => void }) {
  const db = useDb()
  const [start, setStart] = useState(entry.start_ts)
  const [end, setEnd] = useState<number | null>(entry.end_ts)
  const [note, setNote] = useState(entry.note ?? '')

  const span = end != null ? Math.max(0, end - start) : null

  async function save() {
    const patch: Partial<NewEntry> = { start_ts: start, end_ts: end, note: note.trim() || null }
    // For nursing, the feed duration is the start→end span, split across whichever
    // side(s) already had time (ratio preserved); a single-sided feed keeps its side.
    if (entry.type === 'breast' && end != null) {
      const s = Math.max(0, end - start)
      const l = entry.left_ms ?? 0
      const r = entry.right_ms ?? 0
      const sum = l + r
      let nl: number
      let nr: number
      if (sum > 0) { nl = Math.round((l / sum) * s); nr = s - nl } else if (entry.side === 'R') { nl = 0; nr = s } else { nl = s; nr = 0 }
      patch.left_ms = nl
      patch.right_ms = nr
      patch.side = deriveSide(nl, nr)
    }
    await updateEntry(db, entry.id, patch)
    onChanged()
  }
  async function remove() {
    if (!confirm('Delete this entry?')) return
    await deleteEntry(db, entry.id)
    onChanged()
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" data-type={entry.type} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h4>Edit · {span != null ? `${TYPE_NAME[entry.type]} · ${formatDuration(span)}` : entryLabel(entry).text}</h4>
        <div className="sectlbl">Start</div>
        <TimeField value={start} onChange={setStart} />
        {entry.end_ts != null && (
          <>
            <div className="sectlbl">End</div>
            <TimeField value={end ?? entry.end_ts} onChange={setEnd} />
            <p className="edit-duration">Duration · {formatDuration(span ?? 0)}</p>
          </>
        )}
        <textarea className="text-input" rows={2} placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <SheetButtons onCancel={onClose} primaryLabel="Save" onPrimary={save} />
        <button className="btn-danger" onClick={remove}>Delete</button>
      </div>
    </div>
  )
}

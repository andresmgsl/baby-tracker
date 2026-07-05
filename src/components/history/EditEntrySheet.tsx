import { useState } from 'react'
import { useDb } from '../../db/client'
import { updateEntry, deleteEntry } from '../../db/queries'
import type { Entry } from '../../db/types'
import { TimeField, SheetButtons } from '../home/forms/formKit'
import { entryLabel } from '../home/entryLabel'

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

  async function save() {
    await updateEntry(db, entry.id, { start_ts: start, end_ts: end, note: note.trim() || null })
    onChanged()
  }
  async function remove() {
    if (!confirm('Delete this entry?')) return
    await deleteEntry(db, entry.id)
    onChanged()
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h4>Edit · {entryLabel(entry).text}</h4>
        <div className="sectlbl">Start</div>
        <TimeField value={start} onChange={setStart} />
        {entry.end_ts != null && (
          <>
            <div className="sectlbl">End</div>
            <TimeField value={end ?? entry.end_ts} onChange={setEnd} />
          </>
        )}
        <textarea className="text-input" rows={2} placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <SheetButtons onCancel={onClose} primaryLabel="Save" onPrimary={save} />
        <button className="btn-danger" onClick={remove}>Delete</button>
      </div>
    </div>
  )
}

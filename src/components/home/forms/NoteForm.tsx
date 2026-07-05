import { useState } from 'react'
import { useDb } from '../../../db/client'
import { insertEntry } from '../../../db/queries'
import { TimeField, SheetButtons, type FormProps } from './formKit'

const empty = {
  end_ts: null, side: null, amount_ml: null, milk_type: null, food: null,
  diaper_kind: null, med_name: null, med_dose: null, photo_id: null,
}

export function NoteForm({ onClose, onSaved }: FormProps) {
  const db = useDb()
  const [note, setNote] = useState('')
  const [ts, setTs] = useState(Date.now())
  async function save() {
    if (!note.trim()) return
    await insertEntry(db, { type: 'note', start_ts: ts, note: note.trim(), ...empty })
    onSaved()
  }
  return (
    <div>
      <h4>Note</h4>
      <textarea className="text-input" rows={3} placeholder="Anything to remember…" value={note} onChange={(e) => setNote(e.target.value)} />
      <TimeField value={ts} onChange={setTs} />
      <SheetButtons onCancel={onClose} primaryLabel="Save" onPrimary={save} />
    </div>
  )
}

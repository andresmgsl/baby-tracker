import { useState } from 'react'
import { useDb } from '../../../db/client'
import { insertEntry } from '../../../db/queries'
import { TimeField, SheetButtons, type FormProps } from './formKit'

const empty = {
  end_ts: null, side: null, amount_ml: null, milk_type: null, food: null,
  diaper_kind: null, note: null, photo_id: null,
}

export function MedsForm({ onClose, onSaved }: FormProps) {
  const db = useDb()
  const [name, setName] = useState('')
  const [dose, setDose] = useState('')
  const [ts, setTs] = useState(Date.now())
  async function save() {
    await insertEntry(db, { type: 'meds', start_ts: ts, med_name: name.trim() || null, med_dose: dose.trim() || null, ...empty })
    onSaved()
  }
  return (
    <div>
      <h4>Meds / Vitamins</h4>
      <input className="text-input" placeholder="Name (e.g. Vitamin D)" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="text-input" placeholder="Dose (e.g. 1 drop)" value={dose} onChange={(e) => setDose(e.target.value)} />
      <TimeField value={ts} onChange={setTs} />
      <SheetButtons onCancel={onClose} primaryLabel="Save" onPrimary={save} />
    </div>
  )
}

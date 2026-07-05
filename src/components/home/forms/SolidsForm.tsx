import { useState } from 'react'
import { useDb } from '../../../db/client'
import { insertEntry } from '../../../db/queries'
import { TimeField, SheetButtons, type FormProps } from './formKit'

const empty = {
  end_ts: null, side: null, amount_ml: null, milk_type: null, diaper_kind: null,
  med_name: null, med_dose: null, note: null, photo_id: null,
}

export function SolidsForm({ onClose, onSaved }: FormProps) {
  const db = useDb()
  const [food, setFood] = useState('')
  const [ts, setTs] = useState(Date.now())
  async function save() {
    await insertEntry(db, { type: 'solids', start_ts: ts, food: food.trim() || null, ...empty })
    onSaved()
  }
  return (
    <div>
      <h4>Solids</h4>
      <input className="text-input" placeholder="What did they eat?" value={food} onChange={(e) => setFood(e.target.value)} />
      <TimeField value={ts} onChange={setTs} />
      <SheetButtons onCancel={onClose} primaryLabel="Save" onPrimary={save} />
    </div>
  )
}

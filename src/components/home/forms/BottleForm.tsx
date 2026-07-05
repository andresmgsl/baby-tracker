import { useState } from 'react'
import { useDb } from '../../../db/client'
import { insertEntry } from '../../../db/queries'
import type { MilkType } from '../../../db/types'
import { Toggle, Stepper, TimeField, SheetButtons, type FormProps } from './formKit'

const empty = {
  end_ts: null, side: null, food: null, diaper_kind: null,
  med_name: null, med_dose: null, note: null, photo_id: null,
}

export function BottleForm({ onClose, onSaved }: FormProps) {
  const db = useDb()
  const [ml, setMl] = useState(90)
  const [milk, setMilk] = useState<MilkType>('breast')
  const [ts, setTs] = useState(Date.now())
  async function save() {
    await insertEntry(db, { type: 'bottle', start_ts: ts, amount_ml: ml, milk_type: milk, ...empty })
    onSaved()
  }
  return (
    <div>
      <h4>Bottle</h4>
      <Toggle options={[{ value: 'breast', label: 'Breast milk' }, { value: 'formula', label: 'Formula' }]} value={milk} onChange={setMilk} />
      <Stepper label="amount" value={ml} step={10} min={10} unit="ml" onChange={setMl} />
      <TimeField value={ts} onChange={setTs} />
      <SheetButtons onCancel={onClose} primaryLabel="Save" onPrimary={save} />
    </div>
  )
}

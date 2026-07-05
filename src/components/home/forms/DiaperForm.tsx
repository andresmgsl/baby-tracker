import { useState } from 'react'
import { useDb } from '../../../db/client'
import { insertEntry } from '../../../db/queries'
import type { DiaperKind } from '../../../db/types'
import { Toggle, TimeField, SheetButtons, type FormProps } from './formKit'

const empty = {
  end_ts: null, side: null, amount_ml: null, milk_type: null, food: null,
  med_name: null, med_dose: null, note: null, photo_id: null,
}

export function DiaperForm({ onClose, onSaved }: FormProps) {
  const db = useDb()
  const [kind, setKind] = useState<DiaperKind>('wet')
  const [ts, setTs] = useState(Date.now())
  async function save() {
    await insertEntry(db, { type: 'diaper', start_ts: ts, diaper_kind: kind, ...empty })
    onSaved()
  }
  return (
    <div>
      <h4>Diaper</h4>
      <Toggle options={[{ value: 'wet', label: 'wet' }, { value: 'dirty', label: 'dirty' }, { value: 'both', label: 'both' }]} value={kind} onChange={setKind} />
      <TimeField value={ts} onChange={setTs} />
      <SheetButtons onCancel={onClose} primaryLabel="Save" onPrimary={save} />
    </div>
  )
}

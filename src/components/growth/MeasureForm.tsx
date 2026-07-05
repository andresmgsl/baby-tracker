import { useEffect, useState } from 'react'
import { useDb } from '../../db/client'
import { insertMeasurement, getSetting } from '../../db/queries'
import type { MeasurementType } from '../../db/types'
import { kgToG, cmToMm, inToMm, fToC, round1 } from '../../lib/units'
import { TimeField, SheetButtons, type FormProps } from '../home/forms/formKit'

const TYPES: { value: MeasurementType; label: string }[] = [
  { value: 'weight', label: 'Weight' },
  { value: 'height', label: 'Height' },
  { value: 'head', label: 'Head' },
  { value: 'temperature', label: 'Temp' },
]

function toCanonical(type: MeasurementType, value: number, units: Record<string, string>): number {
  if (type === 'weight') return units.weight === 'lb' ? Math.round(value * 453.59237) : kgToG(value)
  if (type === 'temperature') return units.temp === 'F' ? round1(fToC(value)) : value
  // height/head
  return units.length === 'in' ? Math.round(inToMm(value)) : cmToMm(value)
}

export function MeasureForm({ onClose, onSaved, initialType }: FormProps & { initialType: MeasurementType }) {
  const db = useDb()
  const [type, setType] = useState<MeasurementType>(initialType)
  const [raw, setRaw] = useState('')
  const [ts, setTs] = useState(Date.now())
  const [units, setUnits] = useState<Record<string, string>>({ weight: 'kg', length: 'cm', temp: 'C' })

  useEffect(() => {
    void (async () => {
      setUnits({
        weight: (await getSetting(db, 'units_weight')) ?? 'kg',
        length: (await getSetting(db, 'units_length')) ?? 'cm',
        temp: (await getSetting(db, 'units_temp')) ?? 'C',
      })
    })()
  }, [db])

  async function save() {
    const num = parseFloat(raw)
    if (Number.isNaN(num)) return
    await insertMeasurement(db, { type, ts, value: toCanonical(type, num, units), note: null })
    onSaved()
  }

  const unitLabel = type === 'weight' ? units.weight : type === 'temperature' ? `°${units.temp}` : units.length

  return (
    <div>
      <h4>Add measurement</h4>
      <div className="toggle">
        {TYPES.map((t) => (
          <button key={t.value} className={`opt ${t.value === type ? 'on' : ''}`} onClick={() => setType(t.value)}>{t.label}</button>
        ))}
      </div>
      <label className="timefield">
        <span>Value ({unitLabel})</span>
        <input aria-label="value" inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value)} />
      </label>
      <TimeField value={ts} onChange={setTs} />
      <SheetButtons onCancel={onClose} primaryLabel="Save" onPrimary={save} />
    </div>
  )
}

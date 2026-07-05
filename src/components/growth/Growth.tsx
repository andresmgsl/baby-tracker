import { useEffect, useState } from 'react'
import { useDb } from '../../db/client'
import { listMeasurements, deleteMeasurement, getSetting } from '../../db/queries'
import type { Measurement, MeasurementType } from '../../db/types'
import { gToKg, gToLbOz, mmToCm, mmToIn, cToF, round1 } from '../../lib/units'
import { LineChart } from './LineChart'

const TYPES: { value: MeasurementType; label: string }[] = [
  { value: 'weight', label: 'Weight' },
  { value: 'height', label: 'Height' },
  { value: 'head', label: 'Head' },
  { value: 'temperature', label: 'Temp' },
]

function display(type: MeasurementType, value: number, units: Record<string, string>): string {
  if (type === 'weight') return units.weight === 'lb'
    ? (() => { const { lb, oz } = gToLbOz(value); return `${lb}lb ${oz}oz` })()
    : `${gToKg(value)} kg`
  if (type === 'temperature') return units.temp === 'F' ? `${cToF(value)}°F` : `${round1(value)}°C`
  return units.length === 'in' ? `${round1(mmToIn(value))} in` : `${mmToCm(value)} cm`
}

export function Growth() {
  const db = useDb()
  const [type, setType] = useState<MeasurementType>('weight')
  const [rows, setRows] = useState<Measurement[]>([])
  const [units, setUnits] = useState<Record<string, string>>({ weight: 'kg', length: 'cm', temp: 'C' })

  async function reload() {
    setRows(await listMeasurements(db, type))
  }
  useEffect(() => { void reload() }, [db, type])
  useEffect(() => {
    void (async () => setUnits({
      weight: (await getSetting(db, 'units_weight')) ?? 'kg',
      length: (await getSetting(db, 'units_length')) ?? 'cm',
      temp: (await getSetting(db, 'units_temp')) ?? 'C',
    }))()
  }, [db])

  const points = rows.map((m) => ({ x: m.ts, y: m.value }))
  const latest = rows[rows.length - 1]

  return (
    <div>
      <div className="toggle">
        {TYPES.map((t) => (
          <button key={t.value} className={`opt ${t.value === type ? 'on' : ''}`} onClick={() => setType(t.value)}>{t.label}</button>
        ))}
      </div>
      {latest && <p className="latest">Latest: <b>{display(type, latest.value, units)}</b></p>}
      <LineChart points={points} />
      <div className="tl">
        {rows.slice().reverse().map((m) => (
          <div key={m.id} className="row">
            <span className="tm">{new Date(m.ts).toLocaleDateString()}</span>
            <span>{display(type, m.value, units)}</span>
            <button className="btn-link" style={{ width: 'auto', marginLeft: 'auto' }}
              onClick={async () => { await deleteMeasurement(db, m.id); await reload() }}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}

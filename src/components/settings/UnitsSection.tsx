import { useEffect, useState } from 'react'
import { useDb } from '../../db/client'
import { getSetting, setSetting } from '../../db/queries'

const FIELDS: { key: string; label: string; options: string[] }[] = [
  { key: 'units_weight', label: 'Weight', options: ['kg', 'lb'] },
  { key: 'units_length', label: 'Length', options: ['cm', 'in'] },
  { key: 'units_temp', label: 'Temperature', options: ['C', 'F'] },
]

export function UnitsSection() {
  const db = useDb()
  const [vals, setVals] = useState<Record<string, string>>({})
  useEffect(() => {
    void (async () => {
      const out: Record<string, string> = {}
      for (const f of FIELDS) out[f.key] = (await getSetting(db, f.key)) ?? f.options[0]
      setVals(out)
    })()
  }, [db])

  async function change(key: string, value: string) {
    setVals((v) => ({ ...v, [key]: value }))
    await setSetting(db, key, value)
  }

  return (
    <section className="card-section">
      <h3>Units</h3>
      {FIELDS.map((f) => (
        <label key={f.key} className="filter-row">
          <span>{f.label}</span>
          <select aria-label={f.label} value={vals[f.key] ?? f.options[0]} onChange={(e) => change(f.key, e.target.value)}>
            {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      ))}
    </section>
  )
}

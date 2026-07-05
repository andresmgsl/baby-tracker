import { useState } from 'react'
import { useDb } from '../../../db/client'
import { insertEntry, startTimer } from '../../../db/queries'
import { useActiveTimer } from '../../../state/useActiveTimer'
import { formatElapsed } from '../../../lib/timer'
import type { Side } from '../../../db/types'
import { Toggle, Stepper, TimeField, SheetButtons, type FormProps } from './formKit'

const empty = {
  amount_ml: null, milk_type: null, food: null, diaper_kind: null,
  med_name: null, med_dose: null, note: null, photo_id: null,
}

export function BreastForm({ onClose, onSaved }: FormProps) {
  const db = useDb()
  const { timer, elapsed, refresh } = useActiveTimer()
  const [side, setSide] = useState<Side>('L')
  const [manual, setManual] = useState(false)
  const [minutes, setMinutes] = useState(15)
  const [ts, setTs] = useState(Date.now())
  const running = timer?.type === 'breast'

  async function start() {
    await startTimer(db, { type: 'breast', start_ts: Date.now(), side })
    await refresh()
    onSaved() // closes; banner on Home shows running timer
  }
  async function saveManual() {
    const start = ts
    await insertEntry(db, { type: 'breast', start_ts: start, end_ts: start + minutes * 60_000, side, ...empty })
    onSaved()
  }

  return (
    <div>
      <h4>Breastfeed</h4>
      <Toggle options={[{ value: 'L', label: 'Left' }, { value: 'R', label: 'Right' }, { value: 'both', label: 'Both' }]} value={side} onChange={setSide} />
      {running ? (
        <div className="timer-display">● running {formatElapsed(elapsed)} (stop from Home)</div>
      ) : !manual ? (
        <>
          <button className="btn-start" onClick={start}>Start timer</button>
          <button className="btn-link" onClick={() => setManual(true)}>Enter manually</button>
        </>
      ) : (
        <>
          <Stepper label="duration" value={minutes} step={1} min={1} unit="min" onChange={setMinutes} />
          <TimeField value={ts} onChange={setTs} />
          <SheetButtons onCancel={onClose} primaryLabel="Save" onPrimary={saveManual} />
        </>
      )}
    </div>
  )
}

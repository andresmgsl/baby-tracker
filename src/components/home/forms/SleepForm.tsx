import { useState } from 'react'
import { useDb } from '../../../db/client'
import { insertEntry, startTimer } from '../../../db/queries'
import { useActiveTimer } from '../../../state/useActiveTimer'
import { formatElapsed } from '../../../lib/timer'
import { Stepper, TimeField, SheetButtons, type FormProps } from './formKit'

const empty = {
  side: null, amount_ml: null, milk_type: null, food: null, diaper_kind: null,
  med_name: null, med_dose: null, note: null, photo_id: null,
}

export function SleepForm({ onClose, onSaved }: FormProps) {
  const db = useDb()
  const { timer, elapsed, refresh } = useActiveTimer()
  const [manual, setManual] = useState(false)
  const [minutes, setMinutes] = useState(45)
  const [ts, setTs] = useState(Date.now())
  const running = timer?.type === 'sleep'

  async function start() {
    await startTimer(db, { type: 'sleep', start_ts: Date.now(), side: null })
    await refresh()
    onSaved()
  }
  async function saveManual() {
    await insertEntry(db, { type: 'sleep', start_ts: ts, end_ts: ts + minutes * 60_000, ...empty })
    onSaved()
  }
  return (
    <div>
      <h4>Sleep</h4>
      {running ? (
        <div className="timer-display">● running {formatElapsed(elapsed)} (stop from Home)</div>
      ) : !manual ? (
        <>
          <button className="btn-start" onClick={start}>Start timer</button>
          <button className="btn-link" onClick={() => setManual(true)}>Enter manually</button>
        </>
      ) : (
        <>
          <Stepper label="duration" value={minutes} step={5} min={5} unit="min" onChange={setMinutes} />
          <TimeField value={ts} onChange={setTs} />
          <SheetButtons onCancel={onClose} primaryLabel="Save" onPrimary={saveManual} />
        </>
      )}
    </div>
  )
}

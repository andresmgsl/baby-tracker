import { useEffect, useRef, useState } from 'react'
import { useDb } from '../../db/client'
import { useActiveTimer } from '../../state/useActiveTimer'
import { insertEntry, startTimer, clearTimer, setTimerStart, pauseTimer, resumeTimer } from '../../db/queries'
import { formatElapsed, netElapsed, clampStartTs } from '../../lib/timer'
import { Stepper, TimeField } from './forms/formKit'

const EMPTY = {
  side: null, amount_ml: null, milk_type: null, food: null, diaper_kind: null,
  med_name: null, med_dose: null, photo_id: null,
} as const

export interface SleepSessionProps {
  syncSignal: number
  onClose: () => void       // back arrow — keep the timer running
  onCommitted: () => void   // saved / cancelled / external-stop acked
}

export function SleepSession({ syncSignal, onClose, onCommitted }: SleepSessionProps) {
  const db = useDb()
  const { timer, elapsed, refresh } = useActiveTimer()
  const running = timer?.type === 'sleep'
  const paused = running && timer!.paused_at != null

  const [manual, setManual] = useState(false)
  const [minutes, setMinutes] = useState(45)
  const [manualTs, setManualTs] = useState(Date.now())
  const [note, setNote] = useState('')
  const [editingStart, setEditingStart] = useState(false)
  const [externalStopped, setExternalStopped] = useState(false)

  const committing = useRef(false)
  const wasRunning = useRef(false)

  // Live-sync: re-read the timer whenever the app's sync signal changes.
  useEffect(() => { void refresh() }, [syncSignal, refresh])

  // Detect the other caregiver stopping the timer out from under us.
  useEffect(() => {
    if (wasRunning.current && !timer && !committing.current) setExternalStopped(true)
    if (running) wasRunning.current = true
  }, [timer, running])

  async function start() {
    await startTimer(db, { type: 'sleep', start_ts: Date.now(), side: null })
    await refresh()
  }

  async function editStart(ts: number) {
    if (!timer) return
    const clamped = clampStartTs(ts, Date.now(), timer.paused_at)
    await setTimerStart(db, 'sleep', clamped)
    await refresh()
    setEditingStart(false)
  }

  async function pause() {
    if (!timer) return
    await pauseTimer(db, 'sleep', Date.now())
    await refresh()
  }

  async function resume() {
    if (!timer) return
    await resumeTimer(db, 'sleep', Date.now())
    await refresh()
  }

  async function save() {
    if (!timer || committing.current) return
    committing.current = true
    const end_ts = timer.start_ts + netElapsed(timer.start_ts, timer.paused_ms, timer.paused_at, Date.now())
    await insertEntry(db, {
      type: 'sleep', start_ts: timer.start_ts, end_ts,
      note: note.trim() || null, ...EMPTY,
    })
    await clearTimer(db, 'sleep')
    onCommitted()
  }

  async function cancel() {
    if (!window.confirm('Discard this sleep session?')) return
    committing.current = true
    await clearTimer(db, 'sleep')
    onCommitted()
  }

  async function saveManual() {
    if (committing.current) return
    committing.current = true
    await insertEntry(db, {
      type: 'sleep', start_ts: manualTs, end_ts: manualTs + minutes * 60_000,
      note: note.trim() || null, ...EMPTY,
    })
    onCommitted()
  }

  const duration = elapsed

  if (externalStopped) {
    return (
      <div className="sleep-page">
        <div className="sleep-notice">
          <p>This sleep was stopped on another device.</p>
          <button className="btn-primary" onClick={onCommitted}>OK</button>
        </div>
      </div>
    )
  }

  return (
    <div className="sleep-page">
      <header className="sleep-head">
        <button className="sleep-back" aria-label="Back" onClick={onClose}>‹</button>
        <span>SLEEP</span>
        <span className="sleep-head-spacer" />
      </header>

      {!running && !manual && (
        <div className="sleep-prestart">
          <button className="btn-start" onClick={start}>Start</button>
          <button className="btn-link" onClick={() => setManual(true)}>Enter manually</button>
        </div>
      )}

      {!running && manual && (
        <div className="sleep-manual">
          <Stepper label="duration" value={minutes} step={5} min={5} unit="min" onChange={setMinutes} />
          <TimeField value={manualTs} onChange={setManualTs} />
          <textarea className="sleep-note" placeholder="Your note (optional)"
            value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="sleep-actions">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={saveManual}>Save</button>
          </div>
        </div>
      )}

      {running && (
        <div className="sleep-running">
          <div className="sleep-duration">{formatElapsed(duration)}</div>
          <div className="sleep-duration-label">Duration</div>

          <button className={`sleep-stop ${paused ? 'paused' : ''}`}
            onClick={paused ? resume : pause}>
            {paused ? 'RESUME' : 'STOP'}
          </button>

          <div className="sleep-startrow">
            <span>started at</span>
            {editingStart ? (
              <TimeField value={timer.start_ts} onChange={editStart} />
            ) : (
              <>
                <b>{new Date(timer.start_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b>
                <button className="sleep-edit" aria-label="Edit start time"
                  onClick={() => setEditingStart(true)}>✎</button>
              </>
            )}
          </div>

          <textarea className="sleep-note" placeholder="Your note (optional)"
            value={note} onChange={(e) => setNote(e.target.value)} />

          <div className="sleep-actions">
            <button className="btn-ghost" onClick={cancel}>Cancel</button>
            <button className="btn-primary" onClick={save}>Save</button>
          </div>
        </div>
      )}
    </div>
  )
}

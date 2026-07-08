import { useEffect, useRef, useState } from 'react'
import { useDb } from '../../db/client'
import { useActiveTimer } from '../../state/useActiveTimer'
import {
  insertEntry, clearTimer, setTimerStart, getBreastLastSide,
  startBreastSide, pauseBreastSide, bumpBreastSide,
} from '../../db/queries'
import { formatElapsed, clampStartTs } from '../../lib/timer'
import { breastTotals, deriveSide } from '../../lib/breast'
import { Stepper, TimeField } from './forms/formKit'

const EMPTY = {
  amount_ml: null, milk_type: null, food: null, diaper_kind: null,
  med_name: null, med_dose: null, photo_id: null,
} as const

export interface BreastSessionProps {
  syncSignal: number
  onClose: () => void       // back arrow — keep the timer running
  onCommitted: () => void   // saved / cancelled / external-stop acked
}

export function BreastSession({ syncSignal, onClose, onCommitted }: BreastSessionProps) {
  const db = useDb()
  const { timer, refresh } = useActiveTimer()
  const running = timer?.type === 'breast'

  const [now, setNow] = useState(Date.now())
  const [lastSide, setLastSide] = useState<'L' | 'R' | null>(null)
  const [manual, setManual] = useState(false)
  const [leftMin, setLeftMin] = useState(10)
  const [rightMin, setRightMin] = useState(0)
  const [manualTs, setManualTs] = useState(Date.now())
  const [note, setNote] = useState('')
  const [editingStart, setEditingStart] = useState(false)
  const [externalStopped, setExternalStopped] = useState(false)

  const committing = useRef(false)
  const wasRunning = useRef(false)

  // Tick while a side is actively running so the displayed clocks advance.
  useEffect(() => {
    if (!(running && timer!.side)) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running, timer])

  // Live-sync: re-read the timer whenever the app's sync signal changes.
  useEffect(() => { void refresh() }, [syncSignal, refresh])

  // Last-used side for the badge (only meaningful before this session accrues time).
  useEffect(() => {
    void getBreastLastSide(db).then(setLastSide)
  }, [db, syncSignal])

  // Detect the other caregiver ending the session out from under us.
  useEffect(() => {
    if (wasRunning.current && !timer && !committing.current) setExternalStopped(true)
    if (running) wasRunning.current = true
  }, [timer, running])

  const totals = running ? breastTotals(timer!, now) : { left: 0, right: 0, total: 0 }

  async function tap(side: 'L' | 'R') {
    if (running && timer!.side === side) await pauseBreastSide(db, Date.now())
    else await startBreastSide(db, side, Date.now())
    await refresh()
    setNow(Date.now())
  }

  async function editStart(ts: number) {
    if (!timer) return
    // Editing "started at" shifts the feed's start; the resulting +/- delta is
    // added to the active side (or, if none is running, the side with more time).
    const clamped = clampStartTs(ts, Date.now(), null)
    const delta = timer.start_ts - clamped // >0 when moved earlier ⇒ add time
    const active = timer.side === 'L' || timer.side === 'R' ? timer.side : null
    const side: 'L' | 'R' = active ?? (timer.left_ms >= timer.right_ms ? 'L' : 'R')
    await setTimerStart(db, 'breast', clamped)
    if (delta !== 0) await bumpBreastSide(db, side, delta)
    await refresh()
    setNow(Date.now())
    setEditingStart(false)
  }

  async function save() {
    if (!timer || committing.current) return
    const { left, right, total } = breastTotals(timer, Date.now())
    if (total === 0) return
    committing.current = true
    await insertEntry(db, {
      type: 'breast', start_ts: timer.start_ts, end_ts: timer.start_ts + total,
      side: deriveSide(left, right), left_ms: left, right_ms: right,
      note: note.trim() || null, ...EMPTY,
    })
    await clearTimer(db, 'breast')
    onCommitted()
  }

  async function cancel() {
    if (!window.confirm('Discard this nursing session?')) return
    committing.current = true
    await clearTimer(db, 'breast')
    onCommitted()
  }

  async function saveManual() {
    if (committing.current) return
    const left = leftMin * 60_000
    const right = rightMin * 60_000
    const total = left + right
    if (total === 0) return
    committing.current = true
    await insertEntry(db, {
      type: 'breast', start_ts: manualTs, end_ts: manualTs + total,
      side: deriveSide(left, right), left_ms: left, right_ms: right,
      note: note.trim() || null, ...EMPTY,
    })
    onCommitted()
  }

  if (externalStopped) {
    return (
      <div className="breast-page">
        <div className="sleep-notice">
          <p>This nursing session was ended on another device.</p>
          <button className="btn-primary" onClick={onCommitted}>OK</button>
        </div>
      </div>
    )
  }

  return (
    <div className="breast-page">
      <header className="sleep-head">
        <button className="sleep-back" aria-label="Back" onClick={onClose}>‹</button>
        <span>NURSING</span>
        <span className="sleep-head-spacer" />
      </header>
      <p className="breast-tag">#liquidgold</p>

      {!manual && (
        <div className="breast-body">
          <div className="sleep-duration">{formatElapsed(totals.total)}</div>
          <div className="sleep-duration-label">Feed duration</div>

          <div className="breast-sides">
            {(['L', 'R'] as const).map((s) => (
              <div key={s} className="breast-col">
                {lastSide === s && <span className="breast-last">Last</span>}
                <button
                  className={`breast-circle ${running && timer!.side === s ? 'active' : ''}`}
                  aria-label={s === 'L' ? 'Left breast' : 'Right breast'}
                  onClick={() => tap(s)}
                >{s}</button>
                <div className="breast-side-time">
                  {formatElapsed(s === 'L' ? totals.left : totals.right)}
                </div>
              </div>
            ))}
          </div>

          <p className="breast-hint">
            Tap the L or R button to start the timer.<br />
            Tap it once again if you wish to pause or stop.
          </p>

          {running && (
            <div className="sleep-startrow">
              <span>started at</span>
              {editingStart ? (
                <TimeField value={timer!.start_ts} onChange={editStart} />
              ) : (
                <>
                  <b>{new Date(timer!.start_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b>
                  <button className="sleep-edit" aria-label="Edit start time"
                    onClick={() => setEditingStart(true)}>✎</button>
                </>
              )}
            </div>
          )}

          <textarea className="sleep-note" placeholder="Your note (optional)"
            value={note} onChange={(e) => setNote(e.target.value)} />

          {!running && (
            <button className="btn-link" onClick={() => setManual(true)}>ENTER TIME MANUALLY</button>
          )}

          <div className="sleep-actions">
            <button className="btn-ghost" onClick={running ? cancel : onClose}>Cancel</button>
            <button className="btn-primary" onClick={save}>Save</button>
          </div>
        </div>
      )}

      {manual && (
        <div className="sleep-manual">
          <Stepper label="left" value={leftMin} step={1} min={0} unit="min" onChange={setLeftMin} />
          <Stepper label="right" value={rightMin} step={1} min={0} unit="min" onChange={setRightMin} />
          <TimeField value={manualTs} onChange={setManualTs} />
          <textarea className="sleep-note" placeholder="Your note (optional)"
            value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="sleep-actions">
            <button className="btn-ghost" onClick={() => setManual(false)}>Cancel</button>
            <button className="btn-primary" onClick={saveManual}>Save</button>
          </div>
        </div>
      )}
    </div>
  )
}

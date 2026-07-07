import { useCallback, useEffect, useState } from 'react'
import { useDb } from '../db/client'
import { getActiveTimer } from '../db/queries'
import { netElapsed } from '../lib/timer'
import { breastTotals } from '../lib/breast'
import type { ActiveTimer } from '../db/types'

/**
 * Elapsed value shown for a timer: net sleep duration, or — for breast — the
 * feed duration (active L+R time), which freezes when no side is running.
 */
function timerElapsed(timer: ActiveTimer, now: number): number {
  if (timer.type === 'breast') return breastTotals(timer, now).total
  return netElapsed(timer.start_ts, timer.paused_ms, timer.paused_at, now)
}

/** Whether the timer's elapsed value is still advancing (needs a ticking interval). */
function timerRunning(timer: ActiveTimer): boolean {
  if (timer.type === 'breast') return timer.side != null && timer.running_since != null
  return timer.paused_at == null
}

export function useActiveTimer() {
  const db = useDb()
  const [timer, setTimer] = useState<ActiveTimer | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const refresh = useCallback(async () => {
    setTimer(await getActiveTimer(db))
  }, [db])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (!timer) { setElapsed(0); return }
    const tick = () => setElapsed(timerElapsed(timer, Date.now()))
    tick()
    if (!timerRunning(timer)) return // frozen (paused / no side running): no interval
    const h = setInterval(tick, 1000)
    return () => clearInterval(h)
  }, [timer])

  return { timer, elapsed, refresh }
}

import { useCallback, useEffect, useState } from 'react'
import { useDb } from '../db/client'
import { getActiveTimer } from '../db/queries'
import { elapsedMs } from '../lib/timer'
import type { ActiveTimer } from '../db/types'

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
    const tick = () => setElapsed(elapsedMs(timer.start_ts, Date.now()))
    tick()
    const h = setInterval(tick, 1000)
    return () => clearInterval(h)
  }, [timer])

  return { timer, elapsed, refresh }
}

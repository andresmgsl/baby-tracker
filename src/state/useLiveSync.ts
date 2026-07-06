import { useEffect, useRef } from 'react'
import { useDb } from '../db/client'
import { getActiveTimer, latestChangeMarker } from '../db/queries'
import type { ActiveTimer } from '../db/types'

const sigOf = (t: ActiveTimer | null) => (t ? `${t.type}:${t.start_ts}:${t.side}` : '')

export function useLiveSync(onChange: () => void, intervalMs = 3000): void {
  const db = useDb()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const lastSig = useRef<string | null>(null)
  const lastMarker = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const [timer, marker] = await Promise.all([getActiveTimer(db), latestChangeMarker(db)])
        if (cancelled) return
        const sig = sigOf(timer)
        const first = lastSig.current === null
        const changed = !first && (sig !== lastSig.current || marker !== lastMarker.current)
        lastSig.current = sig
        lastMarker.current = marker
        if (changed) onChangeRef.current()
      } catch {
        // transient poll failure — retry next tick
      }
    }

    let id: ReturnType<typeof setInterval> | null = null
    const start = () => { if (id === null) id = setInterval(() => void poll(), intervalMs) }
    const stop = () => { if (id !== null) { clearInterval(id); id = null } }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') { void poll(); start() } else { stop() }
    }

    void poll()               // establish baseline
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)

    return () => {
      cancelled = true
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
    }
  }, [db, intervalMs])
}

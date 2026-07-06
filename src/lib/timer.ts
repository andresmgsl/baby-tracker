const pad = (n: number) => String(n).padStart(2, '0')

export function elapsedMs(startTs: number, now: number): number {
  return Math.max(0, now - startTs)
}

export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** Start time can never sit after the end of the interval (now, or a frozen end). */
export function clampStartTs(desired: number, now: number, endTs: number | null): number {
  return Math.min(desired, endTs ?? now)
}

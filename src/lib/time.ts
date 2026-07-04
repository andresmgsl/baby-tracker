const MIN = 60_000
const DAY = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')

export function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const totalMin = Math.round(ms / MIN)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${pad(m)}m`
}

export function formatAgo(fromTs: number, now: number): string {
  const ms = now - fromTs
  if (ms < MIN) return 'just now'
  const totalMin = Math.round(ms / MIN)
  if (totalMin < 60) return `${totalMin}m ago`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${pad(m)}m ago`
}

export function ageLabel(dobTs: number, now: number): string {
  const days = Math.floor((now - dobTs) / DAY)
  if (days < 14) return `${days} d`
  if (days < 60) return `${Math.floor(days / 7)} wk`
  const months = Math.floor(days / 30.4375)
  if (months < 24) return `${months} mo`
  return `${Math.floor(days / 365.25)} y`
}

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function endOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

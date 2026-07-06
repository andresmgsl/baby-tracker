import type { Entry } from '../../db/types'
import { startOfDay } from '../../lib/time'

export interface DayGroup { key: string; label: string; entries: Entry[] }

const DAY = 86_400_000

function labelFor(dayStart: number, now: number): string {
  const todayStart = startOfDay(now)
  if (dayStart === todayStart) return 'Today'
  if (dayStart === todayStart - DAY) return 'Yesterday'
  return new Date(dayStart).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

export function dayGroups(entries: Entry[], now: number): DayGroup[] {
  const map = new Map<number, Entry[]>()
  for (const e of entries) {
    const dayStart = startOfDay(e.start_ts)
    if (!map.has(dayStart)) map.set(dayStart, [])
    map.get(dayStart)!.push(e)
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([dayStart, es]) => ({ key: String(dayStart), label: labelFor(dayStart, now), entries: es }))
}

import type { Entry, DailyTotals } from '../db/types'

const FEED_TYPES = new Set(['breast', 'bottle', 'solids'])

export function computeDailyTotals(entries: Entry[], dayStart: number, dayEnd: number): DailyTotals {
  let feeds = 0
  let diapers = 0
  let sleepMs = 0
  for (const e of entries) {
    if (e.type === 'sleep' && e.end_ts != null) {
      // Count only the portion of the session that falls inside [dayStart, dayEnd].
      sleepMs += Math.max(0, Math.min(e.end_ts, dayEnd + 1) - Math.max(e.start_ts, dayStart))
      continue
    }
    // Point events belong to the day they started on.
    if (e.start_ts < dayStart || e.start_ts > dayEnd) continue
    if (FEED_TYPES.has(e.type)) feeds++
    else if (e.type === 'diaper') diapers++
  }
  return { feeds, diapers, sleepMs }
}

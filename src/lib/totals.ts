import type { Entry, DailyTotals } from '../db/types'

const FEED_TYPES = new Set(['breast', 'bottle', 'solids'])

export function computeDailyTotals(entries: Entry[]): DailyTotals {
  let feeds = 0
  let diapers = 0
  let sleepMs = 0
  for (const e of entries) {
    if (FEED_TYPES.has(e.type)) feeds++
    else if (e.type === 'diaper') diapers++
    else if (e.type === 'sleep' && e.end_ts != null) sleepMs += e.end_ts - e.start_ts
  }
  return { feeds, diapers, sleepMs }
}

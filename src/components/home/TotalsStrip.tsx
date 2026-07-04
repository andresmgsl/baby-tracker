import type { DailyTotals } from '../../db/types'
import { formatDuration } from '../../lib/time'

export function TotalsStrip({ totals }: { totals: DailyTotals }) {
  return (
    <div className="totals">
      <div className="t"><b>{totals.feeds}</b><span>feeds</span></div>
      <div className="t"><b>{totals.diapers}</b><span>nappies</span></div>
      <div className="t"><b>{formatDuration(totals.sleepMs)}</b><span>sleep</span></div>
    </div>
  )
}

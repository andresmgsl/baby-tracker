import type { ActiveTimer } from '../../db/types'
import { formatElapsed } from '../../lib/timer'

export function TimerBanner({
  timer, elapsed, onStop,
}: {
  timer: ActiveTimer
  elapsed: number
  onStop: () => void
}) {
  return (
    <button className="timer-banner" data-type={timer.type} onClick={onStop}>
      <span className="tb-info">
        <span className="tb-live">
          <i className="pulse" />
          {timer.type === 'breast' ? `Breast · ${timer.side}` : 'Sleep'}
        </span>
        <span className="tb-stop">Tap to open</span>
      </span>
      <span className="tb-time">{formatElapsed(elapsed)}</span>
    </button>
  )
}

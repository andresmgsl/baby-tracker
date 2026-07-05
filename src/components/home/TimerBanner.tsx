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
    <button className="timer-banner" onClick={onStop}>
      ● {timer.type === 'breast' ? `Breastfeed (${timer.side})` : 'Sleep'} timing… {formatElapsed(elapsed)} — tap to stop
    </button>
  )
}

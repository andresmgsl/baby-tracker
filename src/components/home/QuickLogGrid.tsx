import type { EntryType } from '../../db/types'
import { formatAgo } from '../../lib/time'

export type LogTarget = EntryType | 'measure' | 'temperature'

const BUTTONS: { target: LogTarget; icon: string; label: string }[] = [
  { target: 'breast', icon: '🤱', label: 'Breast' },
  { target: 'bottle', icon: '🍼', label: 'Bottle' },
  { target: 'sleep', icon: '😴', label: 'Sleep' },
  { target: 'diaper', icon: '💧', label: 'Diaper' },
  { target: 'solids', icon: '🥄', label: 'Solids' },
  { target: 'meds', icon: '💊', label: 'Meds' },
]

export function QuickLogGrid({
  lasts, onLog, now,
}: {
  lasts: Partial<Record<LogTarget, number>>
  onLog: (t: LogTarget) => void
  now: number
}) {
  return (
    <div className="grid">
      {BUTTONS.map((b) => (
        <button key={b.target} className="gbtn" onClick={() => onLog(b.target)}>
          <span className="ic">{b.icon}</span>
          <span className="nm">{b.label}</span>
          <span className="ago">{lasts[b.target] != null ? formatAgo(lasts[b.target]!, now) : '—'}</span>
        </button>
      ))}
    </div>
  )
}

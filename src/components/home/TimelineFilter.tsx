import type { Entry, EntryType } from '../../db/types'

const CHIPS: { type: EntryType; icon: string; label: string }[] = [
  { type: 'breast', icon: '🤱', label: 'breast' },
  { type: 'bottle', icon: '🍼', label: 'bottle' },
  { type: 'solids', icon: '🥄', label: 'solids' },
  { type: 'sleep', icon: '😴', label: 'sleep' },
  { type: 'diaper', icon: '💧', label: 'diaper' },
  { type: 'meds', icon: '💊', label: 'meds' },
  { type: 'note', icon: '📝', label: 'note' },
]

export function filterEntries(entries: Entry[], selected: Set<EntryType>): Entry[] {
  if (selected.size === 0) return entries
  return entries.filter((e) => selected.has(e.type))
}

export function TimelineFilter({
  selected, onToggle,
}: {
  selected: Set<EntryType>
  onToggle: (t: EntryType) => void
}) {
  return (
    <div className="chips" role="group" aria-label="Filter by type">
      {CHIPS.map((c) => (
        <button
          key={c.type}
          type="button"
          className="chip"
          aria-label={c.label}
          aria-pressed={selected.has(c.type)}
          onClick={() => onToggle(c.type)}
        >
          <span aria-hidden="true">{c.icon}</span>
        </button>
      ))}
    </div>
  )
}

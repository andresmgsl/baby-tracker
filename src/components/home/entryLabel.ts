import type { Entry } from '../../db/types'
import { formatDuration } from '../../lib/time'

export function entryLabel(e: Entry): { icon: string; text: string } {
  const dur = e.end_ts != null ? formatDuration(e.end_ts - e.start_ts) : null
  switch (e.type) {
    case 'breast': {
      if (e.left_ms != null || e.right_ms != null) {
        const l = e.left_ms ?? 0
        const r = e.right_ms ?? 0
        const detail = l > 0 && r > 0
          ? `L ${formatDuration(l)} / R ${formatDuration(r)}`
          : r > 0
            ? `R · ${formatDuration(r)}`
            : `L · ${formatDuration(l)}`
        return { icon: '🤱', text: `Nursing · ${detail}` }
      }
      return { icon: '🤱', text: ['Nursing', e.side, dur].filter(Boolean).join(' · ') }
    }
    case 'bottle':
      return { icon: '🍼', text: ['Bottle', e.amount_ml != null ? `${e.amount_ml}ml` : null, e.milk_type].filter(Boolean).join(' · ') }
    case 'solids':
      return { icon: '🥄', text: ['Solids', e.food].filter(Boolean).join(' · ') }
    case 'sleep':
      return { icon: '😴', text: ['Sleep', dur].filter(Boolean).join(' · ') }
    case 'diaper':
      return { icon: e.diaper_kind === 'dirty' ? '💩' : '💧', text: ['Diaper', e.diaper_kind].filter(Boolean).join(' · ') }
    case 'meds':
      return { icon: '💊', text: ['Meds', e.med_name, e.med_dose].filter(Boolean).join(' · ') }
    case 'note':
      return { icon: '📝', text: e.note ?? 'Note' }
  }
}

import type { LogTarget } from './QuickLogGrid'
import { BottleForm } from './forms/BottleForm'
import { SolidsForm } from './forms/SolidsForm'
import { DiaperForm } from './forms/DiaperForm'
import { MedsForm } from './forms/MedsForm'
import { NoteForm } from './forms/NoteForm'
import { MeasureForm } from '../growth/MeasureForm'
import type { FormProps } from './forms/formKit'

const FORMS: Record<string, (p: FormProps) => JSX.Element> = {
  bottle: BottleForm, solids: SolidsForm,
  diaper: DiaperForm, meds: MedsForm, note: NoteForm,
}

export function LogSheet({
  target, onClose, onSaved,
}: {
  target: LogTarget | 'note' | null
  onClose: () => void
  onSaved: () => void
}) {
  if (!target) return null
  const Form =
    target === 'measure' || target === 'temperature'
      ? (p: FormProps) => <MeasureForm {...p} initialType={target === 'temperature' ? 'temperature' : 'weight'} />
      : FORMS[target]
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" data-type={target} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {Form && <Form onClose={onClose} onSaved={onSaved} />}
      </div>
    </div>
  )
}

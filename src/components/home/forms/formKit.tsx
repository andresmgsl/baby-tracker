export function Toggle<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="toggle">
      {options.map((o) => (
        <button key={o.value} className={`opt ${o.value === value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stepper({
  label, value, step, min = 0, unit, onChange,
}: { label: string; value: number; step: number; min?: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <button className="pm" aria-label={`decrease ${label}`} onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <div className="mid"><b>{value} {unit}</b><span>{label}</span></div>
      <button className="pm" aria-label={`increase ${label}`} onClick={() => onChange(value + step)}>+</button>
    </div>
  )
}

export function TimeField({ value, onChange }: { value: number; onChange: (ts: number) => void }) {
  const d = new Date(value)
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return (
    <label className="timefield">
      <span>When</span>
      <input type="datetime-local" value={local} onChange={(e) => onChange(new Date(e.target.value).getTime())} />
    </label>
  )
}

export function SheetButtons({
  onCancel, primaryLabel, onPrimary,
}: { onCancel: () => void; primaryLabel: string; onPrimary: () => void }) {
  return (
    <div className="sheet-actions">
      <button className="btn-ghost" onClick={onCancel}>Cancel</button>
      <button className="btn-primary" onClick={onPrimary}>{primaryLabel}</button>
    </div>
  )
}

export interface FormProps { onClose: () => void; onSaved: () => void }

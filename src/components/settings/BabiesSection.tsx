import { useState } from 'react'
import { useDb } from '../../db/client'
import { addBaby, renameBaby, setBabyDob, archiveBaby, unarchiveBaby, listBabies, type Baby } from '../../db/queries'
import { useActiveBaby } from '../../state/ActiveBabyContext'
import { ageLabel } from '../../lib/time'

function dateInput(dob: number | null): string {
  return dob ? new Date(dob).toISOString().slice(0, 10) : ''
}

export function BabiesSection() {
  const db = useDb()
  const { babies, reload } = useActiveBaby()
  const [archived, setArchived] = useState<Baby[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [newName, setNewName] = useState('')

  const refreshArchived = async () => setArchived((await listBabies(db, true)).filter((b) => b.archived_at))

  const add = async () => {
    if (!newName.trim()) return
    await addBaby(db, newName.trim(), null)
    setNewName(''); await reload()
  }

  return (
    <section className="card-section">
      <h3>Babies</h3>
      {babies.map((b) => (
        <div key={b.id} className="baby-row">
          <p className="baby-row-name">{b.name}</p>
          <input className="text-input" defaultValue={b.name}
            onBlur={(e) => { void renameBaby(db, b.id, e.target.value).then(reload) }} />
          <label className="timefield"><span>DOB</span>
            <input type="date" defaultValue={dateInput(b.dob)}
              onChange={(e) => { void setBabyDob(db, b.id, e.target.value ? new Date(e.target.value).getTime() : null).then(reload) }} /></label>
          {b.dob && <p className="muted">Age: {ageLabel(b.dob, Date.now())}</p>}
          <button className="btn-link" onClick={() => { void archiveBaby(db, b.id).then(reload) }}>Archive</button>
        </div>
      ))}
      <div className="baby-add">
        <input className="text-input" placeholder="New baby name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn-primary" onClick={() => void add()}>Add</button>
      </div>
      <button className="btn-link" onClick={() => { setShowArchived((v) => !v); if (!showArchived) void refreshArchived() }}>
        {showArchived ? 'Hide archived' : 'Show archived'}
      </button>
      {showArchived && archived.map((b) => (
        <div key={b.id} className="baby-row muted">
          <span>{b.name}</span>
          <button className="btn-link" onClick={() => { void unarchiveBaby(db, b.id).then(() => { void reload(); void refreshArchived() }) }}>Un-archive</button>
        </div>
      ))}
    </section>
  )
}

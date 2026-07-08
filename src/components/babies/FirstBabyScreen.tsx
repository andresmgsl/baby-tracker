import { useState } from 'react'
import { useDb } from '../../db/client'
import { addBaby } from '../../db/queries'
import { useActiveBaby } from '../../state/ActiveBabyContext'

export function FirstBabyScreen() {
  const db = useDb()
  const { reload } = useActiveBaby()
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await addBaby(db, name.trim(), dob ? new Date(dob).getTime() : null)
      await reload()
    } catch {
      setError("Couldn't add baby. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="first-baby">
      <div className="first-baby-card">
        <span className="first-baby-kicker">Welcome</span>
        <h2>Add your first baby</h2>
        <p className="first-baby-sub">Set up a profile to start tracking feeds, sleep and nappies.</p>
        <input className="text-input" placeholder="Name" value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit() }} />
        <label className="timefield"><span>Date of birth</span>
          <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="btn-primary first-baby-submit" disabled={!name.trim() || busy}
          onClick={() => void submit()}>{busy ? 'Adding…' : 'Add baby'}</button>
      </div>
    </div>
  )
}

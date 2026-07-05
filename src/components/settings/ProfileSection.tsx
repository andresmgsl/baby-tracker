import { useEffect, useState } from 'react'
import { useDb } from '../../db/client'
import { getSetting, setSetting } from '../../db/queries'
import { ageLabel } from '../../lib/time'

export function ProfileSection() {
  const db = useDb()
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')

  useEffect(() => {
    void (async () => {
      setName((await getSetting(db, 'baby_name')) ?? '')
      setDob((await getSetting(db, 'baby_dob')) ?? '')
    })()
  }, [db])

  const dobTs = dob ? new Date(dob).getTime() : null
  return (
    <section className="card-section">
      <h3>Baby</h3>
      <input className="text-input" placeholder="Name" value={name}
        onChange={(e) => { setName(e.target.value); void setSetting(db, 'baby_name', e.target.value) }} />
      <label className="timefield">
        <span>Date of birth</span>
        <input type="date" value={dob}
          onChange={(e) => { setDob(e.target.value); void setSetting(db, 'baby_dob', e.target.value) }} />
      </label>
      {dobTs && <p className="muted">Age: {ageLabel(dobTs, Date.now())}</p>}
    </section>
  )
}

import { useRef, useState } from 'react'
import { useDb } from '../../db/client'
import { exportFilename, downloadBytes, readFileBytes } from '../../lib/backup'

export function BackupSection() {
  const db = useDb()
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')

  async function doExport() {
    setStatus('Exporting…')
    const bytes = await db.exportBytes()
    downloadBytes(bytes, exportFilename(Date.now()))
    setStatus('Exported.')
  }
  async function doImport(file: File) {
    if (!confirm('Importing replaces ALL current data. Continue?')) return
    setStatus('Importing…')
    await db.importBytes(await readFileBytes(file))
    setStatus('Imported. Reload to see changes.')
  }

  return (
    <section className="card-section">
      <h3>Backup</h3>
      <button className="btn-primary" onClick={doExport}>Export database (.db)</button>
      <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => fileRef.current?.click()}>Import database</button>
      <input ref={fileRef} type="file" accept=".db,.sqlite3,application/x-sqlite3" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f) }} />
      {status && <p className="muted">{status}</p>}
    </section>
  )
}

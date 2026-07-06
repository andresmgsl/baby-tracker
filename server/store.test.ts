import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStore } from './store'

const paths: string[] = []
const tempPath = () => {
  const p = join(tmpdir(), `bt-store-${paths.length}-test.sqlite3`)
  paths.push(p)
  return p
}
afterEach(() => { for (const p of paths.splice(0)) rmSync(p, { force: true }) })

describe('openStore migration', () => {
  it('adds pause columns to a pre-existing active_timer table and preserves rows', () => {
    const path = tempPath()
    // Simulate an old DB: active_timer without the pause columns, with a live timer.
    const old = new Database(path)
    old.exec(`CREATE TABLE active_timer (type TEXT PRIMARY KEY, start_ts INTEGER NOT NULL, side TEXT)`)
    old.prepare('INSERT INTO active_timer (type, start_ts, side) VALUES (?, ?, ?)').run('sleep', 1000, null)
    old.close()

    const store = openStore(path)
    const cols = store.exec('PRAGMA table_info(active_timer)').map((c) => c.name)
    expect(cols).toContain('paused_ms')
    expect(cols).toContain('paused_at')

    const [row] = store.exec('SELECT * FROM active_timer')
    expect(row.start_ts).toBe(1000)
    expect(row.paused_ms).toBe(0)
    expect(row.paused_at).toBeNull()
    store.close()
  })

  it('is a no-op on a fresh DB (columns already present)', () => {
    const store = openStore(tempPath())
    const cols = store.exec('PRAGMA table_info(active_timer)').map((c) => c.name)
    expect(cols).toContain('paused_ms')
    expect(cols).toContain('paused_at')
    store.close()
  })
})

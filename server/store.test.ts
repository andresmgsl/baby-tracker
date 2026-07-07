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

  it('adds per-side columns to a pre-existing active_timer table and preserves rows', () => {
    const path = tempPath()
    const old = new Database(path)
    old.exec(`CREATE TABLE active_timer (type TEXT PRIMARY KEY, start_ts INTEGER NOT NULL, side TEXT)`)
    old.prepare('INSERT INTO active_timer (type, start_ts, side) VALUES (?, ?, ?)').run('breast', 1000, 'L')
    old.close()

    const store = openStore(path)
    const cols = store.exec('PRAGMA table_info(active_timer)').map((c) => c.name)
    expect(cols).toContain('left_ms')
    expect(cols).toContain('right_ms')
    expect(cols).toContain('running_since')

    const [row] = store.exec('SELECT * FROM active_timer')
    expect(row.start_ts).toBe(1000)
    expect(row.left_ms).toBe(0)
    expect(row.right_ms).toBe(0)
    expect(row.running_since).toBeNull()
    store.close()
  })

  it('adds per-side columns to a pre-existing entries table and preserves rows', () => {
    const path = tempPath()
    const old = new Database(path)
    old.exec(`CREATE TABLE entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, start_ts INTEGER NOT NULL,
      end_ts INTEGER, side TEXT, amount_ml REAL, milk_type TEXT, food TEXT, diaper_kind TEXT,
      med_name TEXT, med_dose TEXT, note TEXT, photo_id INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
    old.prepare(`INSERT INTO entries (type, start_ts, side, created_at, updated_at)
      VALUES ('breast', 2000, 'both', 1, 1)`).run()
    old.close()

    const store = openStore(path)
    const cols = store.exec('PRAGMA table_info(entries)').map((c) => c.name)
    expect(cols).toContain('left_ms')
    expect(cols).toContain('right_ms')
    const [row] = store.exec('SELECT * FROM entries')
    expect(row.start_ts).toBe(2000)
    expect(row.left_ms).toBeNull()
    expect(row.right_ms).toBeNull()
    store.close()
  })
})

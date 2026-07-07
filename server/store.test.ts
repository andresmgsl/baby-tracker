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
  it('adds pause columns to a pre-existing active_timer table and preserves rows in active_timer_legacy', () => {
    const path = tempPath()
    // Simulate an old DB: active_timer without the pause columns, with a live timer.
    const old = new Database(path)
    old.exec(`CREATE TABLE active_timer (type TEXT PRIMARY KEY, start_ts INTEGER NOT NULL, side TEXT)`)
    old.prepare('INSERT INTO active_timer (type, start_ts, side) VALUES (?, ?, ?)').run('sleep', 1000, null)
    old.close()

    const store = openStore(path)
    // This legacy table lacks baby_id, so ensureActiveTimerBaby renames it to active_timer_legacy
    // (leaving it for Task 3 to migrate); ensureActiveTimerColumns ran on it first, in place,
    // so the pause columns are already present on the legacy row.
    const cols = store.exec('PRAGMA table_info(active_timer_legacy)').map((c) => c.name)
    expect(cols).toContain('paused_ms')
    expect(cols).toContain('paused_at')

    const [row] = store.exec('SELECT * FROM active_timer_legacy')
    expect(row.start_ts).toBe(1000)
    expect(row.paused_ms).toBe(0)
    expect(row.paused_at).toBeNull()

    expect(store.exec('SELECT * FROM active_timer')).toEqual([])
    store.close()
  })

  it('is a no-op on a fresh DB (columns already present)', () => {
    const store = openStore(tempPath())
    const cols = store.exec('PRAGMA table_info(active_timer)').map((c) => c.name)
    expect(cols).toContain('paused_ms')
    expect(cols).toContain('paused_at')
    store.close()
  })

  it('adds per-side columns to a pre-existing active_timer table and preserves rows in active_timer_legacy', () => {
    const path = tempPath()
    const old = new Database(path)
    old.exec(`CREATE TABLE active_timer (type TEXT PRIMARY KEY, start_ts INTEGER NOT NULL, side TEXT)`)
    old.prepare('INSERT INTO active_timer (type, start_ts, side) VALUES (?, ?, ?)').run('breast', 1000, 'L')
    old.close()

    const store = openStore(path)
    const cols = store.exec('PRAGMA table_info(active_timer_legacy)').map((c) => c.name)
    expect(cols).toContain('left_ms')
    expect(cols).toContain('right_ms')
    expect(cols).toContain('running_since')

    const [row] = store.exec('SELECT * FROM active_timer_legacy')
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

  it('adds baby_id to a pre-existing measurements table and preserves rows', () => {
    const path = tempPath()
    const old = new Database(path)
    old.exec(`CREATE TABLE measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, ts INTEGER NOT NULL,
      value REAL NOT NULL, note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
    old.prepare(`INSERT INTO measurements (type, ts, value, created_at, updated_at)
      VALUES ('weight', 3000, 4.5, 1, 1)`).run()
    old.close()

    const store = openStore(path)
    const cols = store.exec('PRAGMA table_info(measurements)').map((c) => c.name)
    expect(cols).toContain('baby_id')
    const [row] = store.exec('SELECT * FROM measurements')
    expect(row.ts).toBe(3000)
    expect(row.baby_id).toBeNull()
    store.close()
  })

  it('adds baby_id to a pre-existing photos table and preserves rows', () => {
    const path = tempPath()
    const old = new Database(path)
    old.exec(`CREATE TABLE photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, blob BLOB NOT NULL, mime TEXT NOT NULL, created_at INTEGER NOT NULL)`)
    old.prepare(`INSERT INTO photos (blob, mime, created_at) VALUES (?, 'image/png', 1)`).run(Buffer.from('x'))
    old.close()

    const store = openStore(path)
    const cols = store.exec('PRAGMA table_info(photos)').map((c) => c.name)
    expect(cols).toContain('baby_id')
    const [row] = store.exec('SELECT * FROM photos')
    expect(row.mime).toBe('image/png')
    expect(row.baby_id).toBeNull()
    store.close()
  })

  it('rebuilds legacy settings(key,value) into settings(scope,key,value), preserving rows in settings_legacy', () => {
    const path = tempPath()
    const old = new Database(path)
    old.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
    old.prepare(`INSERT INTO settings (key, value) VALUES ('units', 'metric')`).run()
    old.close()

    const store = openStore(path)
    const settingsCols = store.exec('PRAGMA table_info(settings)').map((c) => c.name)
    expect(settingsCols).toEqual(expect.arrayContaining(['scope', 'key', 'value']))
    expect(store.exec('SELECT * FROM settings')).toEqual([])

    const [legacyRow] = store.exec('SELECT * FROM settings_legacy')
    expect(legacyRow.key).toBe('units')
    expect(legacyRow.value).toBe('metric')
    store.close()
  })

  it('is a no-op on a fresh DB for settings scope (column already present)', () => {
    const store = openStore(tempPath())
    const cols = store.exec('PRAGMA table_info(settings)').map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['scope', 'key', 'value']))
    expect(store.exec("SELECT name FROM sqlite_master WHERE name = 'settings_legacy'")).toEqual([])
    store.close()
  })

  it('is a no-op on a fresh DB for active_timer baby_id (column already present)', () => {
    const store = openStore(tempPath())
    const cols = store.exec('PRAGMA table_info(active_timer)').map((c) => c.name)
    expect(cols).toContain('baby_id')
    expect(store.exec("SELECT name FROM sqlite_master WHERE name = 'active_timer_legacy'")).toEqual([])
    store.close()
  })

  it('migrations are idempotent across repeated opens of the same on-disk DB (e.g. server restart)', () => {
    const path = tempPath()
    const old = new Database(path)
    old.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
    old.prepare(`INSERT INTO settings (key, value) VALUES ('units', 'metric')`).run()
    old.exec(`CREATE TABLE active_timer (type TEXT PRIMARY KEY, start_ts INTEGER NOT NULL, side TEXT)`)
    old.prepare('INSERT INTO active_timer (type, start_ts, side) VALUES (?, ?, ?)').run('sleep', 1000, null)
    old.exec(`CREATE TABLE entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, start_ts INTEGER NOT NULL,
      end_ts INTEGER, side TEXT, amount_ml REAL, milk_type TEXT, food TEXT, diaper_kind TEXT,
      med_name TEXT, med_dose TEXT, note TEXT, photo_id INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
    old.close()

    // First open performs the migration.
    openStore(path).close()
    // Second open (simulating a server restart) must be a no-op: no re-rename, no thrown error,
    // legacy tables/rows untouched.
    const store = openStore(path)
    expect(store.exec('SELECT * FROM settings_legacy')).toHaveLength(1)
    expect(store.exec('SELECT * FROM active_timer_legacy')).toHaveLength(1)
    const cols = store.exec('PRAGMA table_info(entries)').map((c) => c.name)
    expect(cols).toContain('baby_id')
    store.close()
  })

  test('fresh store has babies table and baby_id columns', () => {
    const store = openStore(':memory:')
    const cols = (name: string) =>
      new Set(store.exec(`PRAGMA table_info(${name})`).map((r) => r.name as string))
    expect(cols('babies').has('family')).toBe(true)
    expect(cols('entries').has('baby_id')).toBe(true)
    expect(cols('measurements').has('baby_id')).toBe(true)
    expect(cols('photos').has('baby_id')).toBe(true)
    const settingsPk = store.exec('PRAGMA table_info(settings)').filter((r) => (r.pk as number) > 0)
    expect(new Set(settingsPk.map((r) => r.name))).toEqual(new Set(['scope', 'key']))
    store.close()
  })
})

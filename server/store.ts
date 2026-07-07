import Database from 'better-sqlite3'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { SCHEMA_SQL } from '../src/db/schema.ts'
import { migrateToFamilies } from './migrate.ts'

export type Row = Record<string, unknown>
export interface Statement { sql: string; params?: unknown[] }

export interface Store {
  exec(sql: string, params?: unknown[]): Row[]
  transaction(statements: Statement[]): Row[][]
  serialize(): Buffer
  replace(bytes: Buffer): void
  close(): void
}

function ensureActiveTimerColumns(db: Database.Database): void {
  const names = new Set(
    (db.prepare('PRAGMA table_info(active_timer)').all() as { name: string }[]).map((c) => c.name),
  )
  if (!names.has('paused_ms')) db.exec('ALTER TABLE active_timer ADD COLUMN paused_ms INTEGER NOT NULL DEFAULT 0')
  if (!names.has('paused_at')) db.exec('ALTER TABLE active_timer ADD COLUMN paused_at INTEGER')
  if (!names.has('left_ms')) db.exec('ALTER TABLE active_timer ADD COLUMN left_ms INTEGER NOT NULL DEFAULT 0')
  if (!names.has('right_ms')) db.exec('ALTER TABLE active_timer ADD COLUMN right_ms INTEGER NOT NULL DEFAULT 0')
  if (!names.has('running_since')) db.exec('ALTER TABLE active_timer ADD COLUMN running_since INTEGER')
}

function ensureEntriesColumns(db: Database.Database): void {
  const names = new Set(
    (db.prepare('PRAGMA table_info(entries)').all() as { name: string }[]).map((c) => c.name),
  )
  if (!names.has('left_ms')) db.exec('ALTER TABLE entries ADD COLUMN left_ms INTEGER')
  if (!names.has('right_ms')) db.exec('ALTER TABLE entries ADD COLUMN right_ms INTEGER')
}

function ensureBabyColumns(db: Database.Database): void {
  for (const table of ['entries', 'measurements', 'photos']) {
    const info = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    if (info.length === 0) continue // table doesn't exist yet; SCHEMA_SQL creates it with baby_id
    const names = new Set(info.map((c) => c.name))
    if (!names.has('baby_id')) db.exec(`ALTER TABLE ${table} ADD COLUMN baby_id INTEGER`)
  }
}

function ensureSettingsScope(db: Database.Database): void {
  const cols = (db.prepare('PRAGMA table_info(settings)').all() as { name: string }[]).map((c) => c.name)
  if (cols.length === 0 || cols.includes('scope')) return
  // Legacy settings(key PRIMARY KEY, value). Rebuild with (scope,key) PK.
  db.exec(`
    ALTER TABLE settings RENAME TO settings_legacy;
    CREATE TABLE settings (
      scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
      PRIMARY KEY (scope, key)
    );
  `)
  // Leave settings_legacy in place for the data migration (Task 3) to consume.
}

function ensureActiveTimerBaby(db: Database.Database): void {
  const cols = (db.prepare('PRAGMA table_info(active_timer)').all() as { name: string, pk: number }[])
  if (cols.length === 0 || cols.some((c) => c.name === 'baby_id')) return
  // Legacy active_timer had PK(type). Rebuild with PK(baby_id,type); rows get baby_id in Task 3.
  db.exec(`
    ALTER TABLE active_timer RENAME TO active_timer_legacy;
    CREATE TABLE active_timer (
      baby_id INTEGER NOT NULL, type TEXT NOT NULL, start_ts INTEGER NOT NULL, side TEXT,
      paused_ms INTEGER NOT NULL DEFAULT 0, paused_at INTEGER,
      left_ms INTEGER NOT NULL DEFAULT 0, right_ms INTEGER NOT NULL DEFAULT 0,
      running_since INTEGER, PRIMARY KEY (baby_id, type)
    );
  `)
}

export function openStore(dbPath: string, legacyFamily = 'family'): Store {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true })
  let db = new Database(dbPath)
  // ensureBabyColumns must run before SCHEMA_SQL: SCHEMA_SQL's CREATE INDEX statements for
  // entries/measurements reference baby_id, which on a legacy DB (table exists, no baby_id yet)
  // would fail since CREATE TABLE IF NOT EXISTS no-ops without adding the column first.
  ensureBabyColumns(db)
  db.exec(SCHEMA_SQL)
  ensureActiveTimerColumns(db)
  ensureEntriesColumns(db)
  ensureSettingsScope(db)
  ensureActiveTimerBaby(db)
  migrateToFamilies(db, legacyFamily)

  const runOn = (d: Database.Database, sql: string, params: unknown[] = []): Row[] => {
    const stmt = d.prepare(sql)
    if (stmt.reader) return stmt.all(...(params as never[])) as Row[]
    stmt.run(...(params as never[]))
    return []
  }

  return {
    exec: (sql, params = []) => runOn(db, sql, params),
    transaction(statements) {
      const tx = db.transaction((sts: Statement[]) => sts.map((s) => runOn(db, s.sql, s.params ?? [])))
      return tx(statements)
    },
    serialize: () => db.serialize(),
    replace(bytes) {
      // Load (and validate) the incoming snapshot before touching the live DB;
      // an invalid file throws here and leaves the current DB intact.
      const incoming = new Database(bytes)
      incoming.prepare('SELECT count(*) FROM sqlite_master').get()
      if (dbPath === ':memory:') {
        db.close()
        db = incoming
      } else {
        incoming.close()
        db.close()
        writeFileSync(dbPath, bytes)
        db = new Database(dbPath)
      }
      ensureBabyColumns(db)
      db.exec(SCHEMA_SQL)
      ensureActiveTimerColumns(db)
      ensureEntriesColumns(db)
      ensureSettingsScope(db)
      ensureActiveTimerBaby(db)
      migrateToFamilies(db, legacyFamily)
    },
    close: () => db.close(),
  }
}

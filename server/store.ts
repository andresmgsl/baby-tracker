import Database from 'better-sqlite3'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { SCHEMA_SQL } from '../src/db/schema.ts'

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

export function openStore(dbPath: string): Store {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true })
  let db = new Database(dbPath)
  db.exec(SCHEMA_SQL)
  ensureActiveTimerColumns(db)
  ensureEntriesColumns(db)

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
      db.exec(SCHEMA_SQL)
      ensureActiveTimerColumns(db)
      ensureEntriesColumns(db)
    },
    close: () => db.close(),
  }
}

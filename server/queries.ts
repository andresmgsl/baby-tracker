import type { Row } from './store.ts'

export interface QueryDb { run(sql: string, params?: unknown[]): Row[] }
export interface QueryCtx { family: string; babyId: number }
export type QueryScope = 'baby' | 'family'
export interface QueryDef { scope: QueryScope; run(db: QueryDb, ctx: QueryCtx, args: any): Row[] }

const now = () => Date.now()

const ENTRY_COLS = [
  'type', 'start_ts', 'end_ts', 'side', 'amount_ml', 'milk_type', 'food',
  'diaper_kind', 'med_name', 'med_dose', 'note', 'photo_id', 'left_ms', 'right_ms',
] as const

export const QUERIES: Record<string, QueryDef> = {
  insertEntry: {
    scope: 'baby',
    run(db, ctx, data) {
      const ts = now()
      const cols = ['baby_id', ...ENTRY_COLS, 'created_at', 'updated_at']
      const placeholders = cols.map(() => '?').join(', ')
      const values = [ctx.babyId, ...ENTRY_COLS.map((c) => data[c] ?? null), ts, ts]
      return db.run(
        `INSERT INTO entries (${cols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
        values,
      )
    },
  },
  listEntries: {
    scope: 'baby',
    run(db, ctx, opts) {
      const typeClause = opts.type ? 'AND type = ?' : ''
      const limit = opts.limit ? `LIMIT ${Number(opts.limit)}` : ''
      const params = opts.type ? [ctx.babyId, opts.type] : [ctx.babyId]
      return db.run(
        `SELECT * FROM entries WHERE baby_id = ? ${typeClause} ORDER BY start_ts DESC ${limit}`,
        params,
      )
    },
  },
  listEntriesBetween: {
    scope: 'baby',
    run(db, ctx, { fromTs, toTs }) {
      return db.run(
        'SELECT * FROM entries WHERE baby_id = ? AND start_ts >= ? AND start_ts <= ? ORDER BY start_ts DESC',
        [ctx.babyId, fromTs, toTs],
      )
    },
  },
  lastEntryByType: {
    scope: 'baby',
    run(db, ctx, { type }) {
      return db.run(
        'SELECT * FROM entries WHERE baby_id = ? AND type = ? ORDER BY start_ts DESC LIMIT 1',
        [ctx.babyId, type],
      )
    },
  },
  updateEntry: {
    scope: 'baby',
    run(db, ctx, { id, patch }) {
      const keys = Object.keys(patch)
      if (keys.length === 0) return []
      const set = keys.map((k) => `${k} = ?`).join(', ')
      const values = keys.map((k) => patch[k])
      return db.run(
        `UPDATE entries SET ${set}, updated_at = ? WHERE id = ? AND baby_id = ?`,
        [...values, now(), id, ctx.babyId],
      )
    },
  },
  deleteEntry: {
    scope: 'baby',
    run(db, ctx, { id }) {
      return db.run('DELETE FROM entries WHERE id = ? AND baby_id = ?', [id, ctx.babyId])
    },
  },
  insertMeasurement: {
    scope: 'baby',
    run(db, ctx, data) {
      const ts = now()
      return db.run(
        `INSERT INTO measurements (baby_id, type, ts, value, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [ctx.babyId, data.type, data.ts, data.value, data.note ?? null, ts, ts],
      )
    },
  },
  listMeasurements: {
    scope: 'baby',
    run(db, ctx, { type }) {
      return db.run(
        'SELECT * FROM measurements WHERE baby_id = ? AND type = ? ORDER BY ts ASC',
        [ctx.babyId, type],
      )
    },
  },
  deleteMeasurement: {
    scope: 'baby',
    run(db, ctx, { id }) {
      return db.run('DELETE FROM measurements WHERE id = ? AND baby_id = ?', [id, ctx.babyId])
    },
  },
  getSetting: {
    scope: 'family',
    run(db, ctx, { key }) {
      return db.run('SELECT value FROM settings WHERE scope = ? AND key = ?', [ctx.family, key])
    },
  },
  setSetting: {
    scope: 'family',
    run(db, ctx, { key, value }) {
      return db.run(
        `INSERT INTO settings (scope, key, value) VALUES (?, ?, ?)
         ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
        [ctx.family, key, value],
      )
    },
  },
}

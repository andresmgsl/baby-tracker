import Database from 'better-sqlite3'
import { SCHEMA_SQL } from '../src/db/schema.ts'
import { QUERIES, type QueryDb, type QueryCtx } from './queries.ts'

function harness() {
  const db = new Database(':memory:')
  db.exec(SCHEMA_SQL)
  const qdb: QueryDb = {
    run(sql, params = []) {
      const stmt = db.prepare(sql)
      if (stmt.reader) return stmt.all(...(params as never[])) as any
      stmt.run(...(params as never[])); return []
    },
  }
  const babyId = Number((db.prepare(
    "INSERT INTO babies (family,name,sort_order,created_at,updated_at) VALUES ('lopez','A',0,1,1)",
  ).run()).lastInsertRowid)
  const ctx: QueryCtx = { family: 'lopez', babyId }
  return { db, qdb, ctx, babyId }
}

test('insertEntry stamps baby_id; listEntries filters by baby', () => {
  const { qdb, ctx, babyId } = harness()
  QUERIES.insertEntry.run(qdb, ctx, { type: 'sleep', start_ts: 10 })
  QUERIES.insertEntry.run(qdb, { ...ctx, babyId: babyId + 999 }, { type: 'sleep', start_ts: 20 })
  const rows = QUERIES.listEntries.run(qdb, ctx, {})
  expect(rows).toHaveLength(1)
  expect(rows[0].baby_id).toBe(babyId)
})

test('updateEntry/deleteEntry cannot touch another baby row', () => {
  const { qdb, ctx, babyId } = harness()
  const id = Number(QUERIES.insertEntry.run(qdb, ctx, { type: 'sleep', start_ts: 10 })[0].id)
  QUERIES.updateEntry.run(qdb, { family: 'lopez', babyId: babyId + 1 }, { id, patch: { note: 'x' } })
  expect(QUERIES.listEntries.run(qdb, ctx, {})[0].note).toBeNull()
  QUERIES.deleteEntry.run(qdb, { family: 'lopez', babyId: babyId + 1 }, { id })
  expect(QUERIES.listEntries.run(qdb, ctx, {})).toHaveLength(1)
})

test('measurements are baby-scoped', () => {
  const { qdb, ctx, babyId } = harness()
  QUERIES.insertMeasurement.run(qdb, ctx, { type: 'weight', ts: 1, value: 4.2, note: null })
  QUERIES.insertMeasurement.run(qdb, { ...ctx, babyId: babyId + 1 }, { type: 'weight', ts: 2, value: 9, note: null })
  const rows = QUERIES.listMeasurements.run(qdb, ctx, { type: 'weight' })
  expect(rows).toHaveLength(1)
  expect(rows[0].value).toBe(4.2)
})

test('settings are family-scoped', () => {
  const { qdb, ctx } = harness()
  QUERIES.setSetting.run(qdb, ctx, { key: 'units', value: 'oz' })
  expect(QUERIES.getSetting.run(qdb, ctx, { key: 'units' })[0].value).toBe('oz')
  // A different family sees nothing.
  expect(QUERIES.getSetting.run(qdb, { family: 'nunez', babyId: -1 }, { key: 'units' })).toHaveLength(0)
})

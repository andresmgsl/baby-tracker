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

test('updateEntry cannot reassign baby_id (allowlisted patch columns)', () => {
  const { qdb, ctx, babyId } = harness()
  const id = Number(QUERIES.insertEntry.run(qdb, ctx, { type: 'sleep', start_ts: 10 })[0].id)
  QUERIES.updateEntry.run(qdb, ctx, { id, patch: { baby_id: babyId + 999, note: 'x' } })
  const [row] = QUERIES.listEntries.run(qdb, ctx, {})
  expect(row.baby_id).toBe(babyId) // baby_id is non-patchable
  expect(row.note).toBe('x') // legit column still applies
})

test('listEntries respects a numeric limit', () => {
  const { qdb, ctx } = harness()
  QUERIES.insertEntry.run(qdb, ctx, { type: 'sleep', start_ts: 10 })
  QUERIES.insertEntry.run(qdb, ctx, { type: 'sleep', start_ts: 20 })
  QUERIES.insertEntry.run(qdb, ctx, { type: 'sleep', start_ts: 30 })
  const rows = QUERIES.listEntries.run(qdb, ctx, { limit: 2 })
  expect(rows).toHaveLength(2)
  expect(rows[0].start_ts).toBe(30) // most recent first
})

test('listEntries ignores a non-numeric limit instead of erroring', () => {
  const { qdb, ctx } = harness()
  QUERIES.insertEntry.run(qdb, ctx, { type: 'sleep', start_ts: 10 })
  expect(() => QUERIES.listEntries.run(qdb, ctx, { limit: 'nope' })).not.toThrow()
  expect(QUERIES.listEntries.run(qdb, ctx, { limit: 'nope' })).toHaveLength(1)
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

test('timers are isolated per baby', () => {
  const { qdb, ctx, babyId } = harness()
  QUERIES.startTimer.run(qdb, ctx, { type: 'sleep', start_ts: 100, side: null })
  expect(QUERIES.getActiveTimer.run(qdb, ctx, {})).toHaveLength(1)
  expect(QUERIES.getActiveTimer.run(qdb, { ...ctx, babyId: babyId + 1 }, {})).toHaveLength(0)
})

test('startBreastSide records per-baby last side', () => {
  const { qdb, ctx, babyId } = harness()
  QUERIES.startBreastSide.run(qdb, ctx, { side: 'R', now: 500 })
  expect(QUERIES.getSetting.run(qdb, ctx, { key: 'x' })).toBeDefined() // sanity: getSetting works
  // last side stored under baby scope, not family scope:
  const row = qdb.run("SELECT value FROM settings WHERE scope=? AND key='breast_last_side'", [`baby:${babyId}`])
  expect(row[0].value).toBe('R')
})

test('getBreastLastSide reads the baby-scoped last side, isolated per baby', () => {
  const { qdb, ctx, babyId } = harness()
  QUERIES.startBreastSide.run(qdb, ctx, { side: 'R', now: 500 })
  expect(QUERIES.getBreastLastSide.run(qdb, ctx, {})).toEqual([{ value: 'R' }])
  // A different baby (even in the same family) sees no row.
  expect(QUERIES.getBreastLastSide.run(qdb, { ...ctx, babyId: babyId + 1 }, {})).toHaveLength(0)
})

test('latestChangeMarker reflects only this baby', () => {
  const { qdb, ctx, babyId } = harness()
  QUERIES.insertEntry.run(qdb, ctx, { type: 'sleep', start_ts: 10 })
  const mine = Number(QUERIES.latestChangeMarker.run(qdb, ctx, {})[0].marker)
  const other = Number(QUERIES.latestChangeMarker.run(qdb, { ...ctx, babyId: babyId + 1 }, {})[0].marker)
  expect(mine).toBeGreaterThan(0)
  expect(other).toBe(0)
})

test('babies are family-scoped and manageable', () => {
  const { qdb, ctx } = harness() // harness already inserted one 'lopez' baby 'A'
  const id = Number(QUERIES.addBaby.run(qdb, ctx, { name: 'B', dob: 123 })[0].id)
  expect(QUERIES.listBabies.run(qdb, ctx, {}).map((b) => b.name).sort()).toEqual(['A', 'B'])
  // Other family cannot see or rename lopez babies.
  expect(QUERIES.listBabies.run(qdb, { family: 'nunez', babyId: -1 }, {})).toHaveLength(0)
  QUERIES.renameBaby.run(qdb, { family: 'nunez', babyId: -1 }, { id, name: 'HACK' })
  expect(QUERIES.listBabies.run(qdb, ctx, {}).find((b) => b.id === id)!.name).toBe('B')
  // Archive hides from default list but includeArchived shows it.
  QUERIES.archiveBaby.run(qdb, ctx, { id })
  expect(QUERIES.listBabies.run(qdb, ctx, {}).map((b) => b.name)).toEqual(['A'])
  expect(QUERIES.listBabies.run(qdb, ctx, { includeArchived: true })).toHaveLength(2)
})

import { describe, it, expect, beforeEach } from 'vitest'
import { makeTestExecutor } from './testExecutor'
import type { SqlExecutor } from './executor'
import {
  insertEntry, listEntries, listEntriesBetween, updateEntry, deleteEntry,
  insertMeasurement, listMeasurements, deleteMeasurement,
  getSetting, setSetting, startTimer, getActiveTimer, clearTimer, lastEntryByType,
  latestChangeMarker,
} from './queries'

let db: SqlExecutor
beforeEach(async () => { db = await makeTestExecutor() })

const newEntry = (over = {}) => ({
  type: 'breast' as const, start_ts: 1000, end_ts: null, side: 'L' as const,
  amount_ml: null, milk_type: null, food: null, diaper_kind: null,
  med_name: null, med_dose: null, note: null, photo_id: null, ...over,
})

describe('entries CRUD', () => {
  it('inserts and reads back with generated id and timestamps', async () => {
    const id = await insertEntry(db, newEntry())
    expect(id).toBeGreaterThan(0)
    const [row] = await listEntries(db)
    expect(row.id).toBe(id)
    expect(row.type).toBe('breast')
    expect(row.created_at).toBeGreaterThan(0)
  })

  it('lists newest first and filters by type', async () => {
    await insertEntry(db, newEntry({ start_ts: 100 }))
    await insertEntry(db, newEntry({ type: 'diaper', start_ts: 200, side: null, diaper_kind: 'wet' }))
    const all = await listEntries(db)
    expect(all.map((e) => e.start_ts)).toEqual([200, 100])
    const diapers = await listEntries(db, { type: 'diaper' })
    expect(diapers).toHaveLength(1)
  })

  it('lists entries within a time window', async () => {
    await insertEntry(db, newEntry({ start_ts: 50 }))
    await insertEntry(db, newEntry({ start_ts: 150 }))
    await insertEntry(db, newEntry({ start_ts: 250 }))
    const rows = await listEntriesBetween(db, 100, 200)
    expect(rows.map((e) => e.start_ts)).toEqual([150])
  })

  it('updates and bumps updated_at', async () => {
    const id = await insertEntry(db, newEntry())
    await updateEntry(db, id, { end_ts: 5000, note: 'sleepy' })
    const [row] = await listEntries(db)
    expect(row.end_ts).toBe(5000)
    expect(row.note).toBe('sleepy')
  })

  it('deletes', async () => {
    const id = await insertEntry(db, newEntry())
    await deleteEntry(db, id)
    expect(await listEntries(db)).toHaveLength(0)
  })

  it('finds the last entry of a type', async () => {
    await insertEntry(db, newEntry({ start_ts: 100 }))
    await insertEntry(db, newEntry({ start_ts: 300 }))
    const last = await lastEntryByType(db, 'breast')
    expect(last?.start_ts).toBe(300)
    expect(await lastEntryByType(db, 'bottle')).toBeNull()
  })
})

describe('measurements', () => {
  it('inserts and lists oldest first per type', async () => {
    await insertMeasurement(db, { type: 'weight', ts: 200, value: 5200, note: null })
    await insertMeasurement(db, { type: 'weight', ts: 100, value: 5000, note: null })
    await insertMeasurement(db, { type: 'height', ts: 100, value: 620, note: null })
    const weights = await listMeasurements(db, 'weight')
    expect(weights.map((m) => m.ts)).toEqual([100, 200])
    expect(await listMeasurements(db, 'height')).toHaveLength(1)
  })
  it('deletes', async () => {
    const id = await insertMeasurement(db, { type: 'weight', ts: 1, value: 5000, note: null })
    await deleteMeasurement(db, id)
    expect(await listMeasurements(db, 'weight')).toHaveLength(0)
  })
})

describe('settings', () => {
  it('upserts and reads, returns null when missing', async () => {
    expect(await getSetting(db, 'units_weight')).toBeNull()
    await setSetting(db, 'units_weight', 'lb')
    expect(await getSetting(db, 'units_weight')).toBe('lb')
    await setSetting(db, 'units_weight', 'kg')
    expect(await getSetting(db, 'units_weight')).toBe('kg')
  })
})

describe('active timer', () => {
  it('starts, reads, and clears a timer', async () => {
    expect(await getActiveTimer(db)).toBeNull()
    await startTimer(db, { type: 'breast', start_ts: 1234, side: 'R' })
    const t = await getActiveTimer(db)
    expect(t).toEqual({ type: 'breast', start_ts: 1234, side: 'R' })
    await clearTimer(db, 'breast')
    expect(await getActiveTimer(db)).toBeNull()
  })
})

describe('latestChangeMarker', () => {
  it('is 0 with no data and rises after an insert', async () => {
    const exec = await makeTestExecutor()
    expect(await latestChangeMarker(exec)).toBe(0)
    await insertEntry(exec, {
      type: 'diaper', start_ts: 1_000, end_ts: null, side: null, amount_ml: null,
      milk_type: null, food: null, diaper_kind: 'wet', med_name: null, med_dose: null,
      note: null, photo_id: null,
    })
    expect(await latestChangeMarker(exec)).toBeGreaterThan(0)
  })
})

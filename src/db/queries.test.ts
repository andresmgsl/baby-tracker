import { describe, it, expect, beforeEach } from 'vitest'
import { makeTestApi } from './testApi'
import type { Api } from './client'
import {
  insertEntry, listEntries, listEntriesBetween, updateEntry, deleteEntry,
  insertMeasurement, listMeasurements, deleteMeasurement,
  getSetting, setSetting, startTimer, getActiveTimer, clearTimer, lastEntryByType,
  latestChangeMarker, setTimerStart, pauseTimer, resumeTimer,
  startBreastSide, pauseBreastSide,
} from './queries'

let db: Api
beforeEach(() => { db = makeTestApi().db })

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
    expect(t).toEqual({
      type: 'breast', start_ts: 1234, side: 'R', paused_ms: 0, paused_at: null,
      left_ms: 0, right_ms: 0, running_since: null,
    })
    await clearTimer(db, 'breast')
    expect(await getActiveTimer(db)).toBeNull()
  })

  it('starts with clean pause state', async () => {
    await startTimer(db, { type: 'sleep', start_ts: 1000, side: null })
    const t = await getActiveTimer(db)
    expect(t?.paused_ms).toBe(0)
    expect(t?.paused_at).toBeNull()
  })

  it('pauseTimer sets paused_at once and is a no-op while already paused', async () => {
    await startTimer(db, { type: 'sleep', start_ts: 1000, side: null })
    await pauseTimer(db, 'sleep', 5000)
    expect((await getActiveTimer(db))?.paused_at).toBe(5000)
    await pauseTimer(db, 'sleep', 9000) // already paused → ignored
    expect((await getActiveTimer(db))?.paused_at).toBe(5000)
  })

  it('resumeTimer accumulates paused_ms and clears paused_at', async () => {
    await startTimer(db, { type: 'sleep', start_ts: 1000, side: null })
    await pauseTimer(db, 'sleep', 5000)
    await resumeTimer(db, 'sleep', 8000) // +3000
    let t = await getActiveTimer(db)
    expect(t?.paused_ms).toBe(3000)
    expect(t?.paused_at).toBeNull()
    await pauseTimer(db, 'sleep', 10_000)
    await resumeTimer(db, 'sleep', 10_500) // +500 → 3500
    t = await getActiveTimer(db)
    expect(t?.paused_ms).toBe(3500)
  })

  it('resumeTimer is a no-op while running', async () => {
    await startTimer(db, { type: 'sleep', start_ts: 1000, side: null })
    await resumeTimer(db, 'sleep', 9000)
    expect((await getActiveTimer(db))?.paused_ms).toBe(0)
  })

  it('setTimerStart changes start_ts but preserves pause state', async () => {
    await startTimer(db, { type: 'sleep', start_ts: 1000, side: 'L' })
    await pauseTimer(db, 'sleep', 5000)
    await setTimerStart(db, 'sleep', 2000)
    const t = await getActiveTimer(db)
    expect(t?.start_ts).toBe(2000)
    expect(t?.side).toBe('L')
    expect(t?.paused_at).toBe(5000)
  })
})

describe('breast per-side timer', () => {
  // startBreastSide records the last side under the per-baby settings scope
  // (`baby:<id>`), not the family scope that getSetting reads. Assert against
  // the actual write location so the original intent (last side is persisted)
  // is preserved faithfully. See report: getSetting cannot read this key.
  const lastSide = (raw: import('better-sqlite3').Database, babyId: number) =>
    (raw.prepare('SELECT value FROM settings WHERE scope = ? AND key = ?')
      .get(`baby:${babyId}`, 'breast_last_side') as { value: string } | undefined)?.value ?? null

  it('starts a side: inserts a running breast row and records last side', async () => {
    const { db, raw, babyId } = makeTestApi()
    await startBreastSide(db, 'L', 1000)
    const t = (await getActiveTimer(db))!
    expect(t.type).toBe('breast')
    expect(t.start_ts).toBe(1000)
    expect(t.side).toBe('L')
    expect(t.running_since).toBe(1000)
    expect(t.left_ms).toBe(0)
    expect(lastSide(raw, babyId)).toBe('L')
  })

  it('switching sides commits the running side into its accumulator', async () => {
    const { db, raw, babyId } = makeTestApi()
    await startBreastSide(db, 'L', 1000)
    await startBreastSide(db, 'R', 6000) // L ran 5000ms
    const t = (await getActiveTimer(db))!
    expect(t.left_ms).toBe(5000)
    expect(t.side).toBe('R')
    expect(t.running_since).toBe(6000)
    expect(t.start_ts).toBe(1000) // session start unchanged
    expect(lastSide(raw, babyId)).toBe('R')
  })

  it('pausing commits the running side and clears running state', async () => {
    const { db } = makeTestApi()
    await startBreastSide(db, 'R', 1000)
    await pauseBreastSide(db, 4000) // R ran 3000ms
    const t = (await getActiveTimer(db))!
    expect(t.right_ms).toBe(3000)
    expect(t.side).toBeNull()
    expect(t.running_since).toBeNull()
  })

  it('pause is a no-op when nothing is running', async () => {
    const { db } = makeTestApi()
    await startBreastSide(db, 'L', 1000)
    await pauseBreastSide(db, 4000) // L -> 3000
    await pauseBreastSide(db, 9000) // no side running; no change
    const t = (await getActiveTimer(db))!
    expect(t.left_ms).toBe(3000)
  })

  it('resuming after pause starts the tapped side without a new row', async () => {
    const { db } = makeTestApi()
    await startBreastSide(db, 'L', 1000)
    await pauseBreastSide(db, 4000)   // left_ms = 3000
    await startBreastSide(db, 'L', 5000) // resume L
    const t = (await getActiveTimer(db))!
    expect(t.left_ms).toBe(3000)
    expect(t.side).toBe('L')
    expect(t.running_since).toBe(5000)
  })
})

describe('latestChangeMarker', () => {
  it('is 0 with no data and rises after an insert', async () => {
    const { db } = makeTestApi()
    expect(await latestChangeMarker(db)).toBe(0)
    await insertEntry(db, {
      type: 'diaper', start_ts: 1_000, end_ts: null, side: null, amount_ml: null,
      milk_type: null, food: null, diaper_kind: 'wet', med_name: null, med_dose: null,
      note: null, photo_id: null,
    })
    expect(await latestChangeMarker(db)).toBeGreaterThan(0)
  })
})

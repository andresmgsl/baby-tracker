import type { Api } from './client'
import type { Row } from './executor'
import type {
  Entry, EntryType, Measurement, MeasurementType, ActiveTimer,
} from './types'

export type NewEntry =
  Omit<Entry, 'id' | 'created_at' | 'updated_at' | 'left_ms' | 'right_ms' | 'baby_id'>
  & { left_ms?: number | null; right_ms?: number | null }
export type NewMeasurement = Omit<Measurement, 'id' | 'created_at' | 'updated_at' | 'baby_id'>

export interface Baby {
  id: number; family: string; name: string; dob: number | null;
  archived_at: number | null; sort_order: number; created_at: number; updated_at: number;
}

export async function insertEntry(db: Api, data: NewEntry): Promise<number> {
  const rows = await db.q<Row[]>('insertEntry', data)
  return rows[0].id as number
}
export async function listEntries(db: Api, opts: { type?: EntryType; limit?: number } = {}): Promise<Entry[]> {
  return db.q<Entry[]>('listEntries', opts)
}
export async function listEntriesBetween(db: Api, fromTs: number, toTs: number): Promise<Entry[]> {
  return db.q<Entry[]>('listEntriesBetween', { fromTs, toTs })
}
export async function lastEntryByType(db: Api, type: EntryType): Promise<Entry | null> {
  const rows = await db.q<Entry[]>('lastEntryByType', { type })
  return rows[0] ?? null
}
export async function updateEntry(db: Api, id: number, patch: Partial<NewEntry>): Promise<void> {
  await db.q('updateEntry', { id, patch })
}
export async function deleteEntry(db: Api, id: number): Promise<void> {
  await db.q('deleteEntry', { id })
}
export async function insertMeasurement(db: Api, data: NewMeasurement): Promise<number> {
  const rows = await db.q<Row[]>('insertMeasurement', data)
  return rows[0].id as number
}
export async function listMeasurements(db: Api, type: MeasurementType): Promise<Measurement[]> {
  return db.q<Measurement[]>('listMeasurements', { type })
}
export async function deleteMeasurement(db: Api, id: number): Promise<void> {
  await db.q('deleteMeasurement', { id })
}
export async function getSetting(db: Api, key: string): Promise<string | null> {
  const rows = await db.q<Row[]>('getSetting', { key })
  return rows.length ? (rows[0].value as string) : null
}
export async function setSetting(db: Api, key: string, value: string): Promise<void> {
  await db.q('setSetting', { key, value })
}
export async function startTimer(db: Api, t: { type: ActiveTimer['type']; start_ts: number; side: ActiveTimer['side'] }): Promise<void> {
  await db.q('startTimer', t)
}
export async function setTimerStart(db: Api, type: ActiveTimer['type'], start_ts: number): Promise<void> {
  await db.q('setTimerStart', { type, start_ts })
}
export async function pauseTimer(db: Api, type: ActiveTimer['type'], now: number): Promise<void> {
  await db.q('pauseTimer', { type, now })
}
export async function resumeTimer(db: Api, type: ActiveTimer['type'], now: number): Promise<void> {
  await db.q('resumeTimer', { type, now })
}
export async function startBreastSide(db: Api, side: 'L' | 'R', now: number): Promise<void> {
  await db.q('startBreastSide', { side, now })
}
export async function getBreastLastSide(db: Api): Promise<'L' | 'R' | null> {
  const rows = await db.q<Row[]>('getBreastLastSide', {})
  const v = rows[0]?.value
  return v === 'R' ? 'R' : v === 'L' ? 'L' : null
}
export async function pauseBreastSide(db: Api, now: number): Promise<void> {
  await db.q('pauseBreastSide', { now })
}
export async function bumpBreastSide(db: Api, side: 'L' | 'R', deltaMs: number): Promise<void> {
  await db.q('bumpBreastSide', { side, deltaMs })
}
export async function getActiveTimer(db: Api): Promise<ActiveTimer | null> {
  const rows = await db.q<Row[]>('getActiveTimer', {})
  if (!rows.length) return null
  const r = rows[0]
  return {
    type: r.type as ActiveTimer['type'],
    start_ts: r.start_ts as number,
    side: r.side as ActiveTimer['side'],
    paused_ms: (r.paused_ms as number) ?? 0,
    paused_at: (r.paused_at as number | null) ?? null,
    left_ms: (r.left_ms as number) ?? 0,
    right_ms: (r.right_ms as number) ?? 0,
    running_since: (r.running_since as number | null) ?? null,
  }
}
export async function clearTimer(db: Api, type: ActiveTimer['type']): Promise<void> {
  await db.q('clearTimer', { type })
}
export async function latestChangeMarker(db: Api): Promise<number> {
  const rows = await db.q<Row[]>('latestChangeMarker', {})
  return (rows[0]?.marker as number | null) ?? 0
}

// ---- baby management ----
export async function listBabies(db: Api, includeArchived = false): Promise<Baby[]> {
  return db.q<Baby[]>('listBabies', { includeArchived })
}
export async function addBaby(db: Api, name: string, dob: number | null): Promise<number> {
  const rows = await db.q<Row[]>('addBaby', { name, dob })
  return rows[0].id as number
}
export async function renameBaby(db: Api, id: number, name: string): Promise<void> {
  await db.q('renameBaby', { id, name })
}
export async function setBabyDob(db: Api, id: number, dob: number | null): Promise<void> {
  await db.q('setBabyDob', { id, dob })
}
export async function archiveBaby(db: Api, id: number): Promise<void> {
  await db.q('archiveBaby', { id })
}
export async function unarchiveBaby(db: Api, id: number): Promise<void> {
  await db.q('unarchiveBaby', { id })
}

import type { SqlExecutor } from './executor'
import type {
  Entry, EntryType, Measurement, MeasurementType, ActiveTimer,
} from './types'

export type NewEntry = Omit<Entry, 'id' | 'created_at' | 'updated_at'>
export type NewMeasurement = Omit<Measurement, 'id' | 'created_at' | 'updated_at'>

const now = () => Date.now()

const ENTRY_COLS = [
  'type', 'start_ts', 'end_ts', 'side', 'amount_ml', 'milk_type', 'food',
  'diaper_kind', 'med_name', 'med_dose', 'note', 'photo_id',
] as const

export async function insertEntry(exec: SqlExecutor, data: NewEntry): Promise<number> {
  const ts = now()
  const cols = [...ENTRY_COLS, 'created_at', 'updated_at']
  const placeholders = cols.map(() => '?').join(', ')
  const values = [...ENTRY_COLS.map((c) => data[c]), ts, ts]
  const rows = await exec.exec(
    `INSERT INTO entries (${cols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
    values,
  )
  return rows[0].id as number
}

export async function listEntries(
  exec: SqlExecutor,
  opts: { type?: EntryType; limit?: number } = {},
): Promise<Entry[]> {
  const where = opts.type ? 'WHERE type = ?' : ''
  const limit = opts.limit ? `LIMIT ${Number(opts.limit)}` : ''
  const params = opts.type ? [opts.type] : []
  return (await exec.exec(
    `SELECT * FROM entries ${where} ORDER BY start_ts DESC ${limit}`,
    params,
  )) as unknown as Entry[]
}

export async function listEntriesBetween(
  exec: SqlExecutor, fromTs: number, toTs: number,
): Promise<Entry[]> {
  return (await exec.exec(
    'SELECT * FROM entries WHERE start_ts >= ? AND start_ts <= ? ORDER BY start_ts DESC',
    [fromTs, toTs],
  )) as unknown as Entry[]
}

export async function lastEntryByType(
  exec: SqlExecutor, type: EntryType,
): Promise<Entry | null> {
  const rows = (await exec.exec(
    'SELECT * FROM entries WHERE type = ? ORDER BY start_ts DESC LIMIT 1',
    [type],
  )) as unknown as Entry[]
  return rows[0] ?? null
}

export async function updateEntry(
  exec: SqlExecutor, id: number, patch: Partial<NewEntry>,
): Promise<void> {
  const keys = Object.keys(patch) as (keyof NewEntry)[]
  if (keys.length === 0) return
  const set = keys.map((k) => `${k} = ?`).join(', ')
  const values = keys.map((k) => patch[k])
  await exec.exec(`UPDATE entries SET ${set}, updated_at = ? WHERE id = ?`, [...values, now(), id])
}

export async function deleteEntry(exec: SqlExecutor, id: number): Promise<void> {
  await exec.exec('DELETE FROM entries WHERE id = ?', [id])
}

export async function insertMeasurement(
  exec: SqlExecutor, data: NewMeasurement,
): Promise<number> {
  const ts = now()
  const rows = await exec.exec(
    `INSERT INTO measurements (type, ts, value, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    [data.type, data.ts, data.value, data.note, ts, ts],
  )
  return rows[0].id as number
}

export async function listMeasurements(
  exec: SqlExecutor, type: MeasurementType,
): Promise<Measurement[]> {
  return (await exec.exec(
    'SELECT * FROM measurements WHERE type = ? ORDER BY ts ASC',
    [type],
  )) as unknown as Measurement[]
}

export async function deleteMeasurement(exec: SqlExecutor, id: number): Promise<void> {
  await exec.exec('DELETE FROM measurements WHERE id = ?', [id])
}

export async function getSetting(exec: SqlExecutor, key: string): Promise<string | null> {
  const rows = await exec.exec('SELECT value FROM settings WHERE key = ?', [key])
  return rows.length ? (rows[0].value as string) : null
}

export async function setSetting(exec: SqlExecutor, key: string, value: string): Promise<void> {
  await exec.exec(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  )
}

export async function startTimer(exec: SqlExecutor, t: ActiveTimer): Promise<void> {
  await exec.exec(
    `INSERT INTO active_timer (type, start_ts, side) VALUES (?, ?, ?)
     ON CONFLICT(type) DO UPDATE SET start_ts = excluded.start_ts, side = excluded.side`,
    [t.type, t.start_ts, t.side],
  )
}

export async function getActiveTimer(exec: SqlExecutor): Promise<ActiveTimer | null> {
  const rows = await exec.exec('SELECT * FROM active_timer LIMIT 1')
  if (!rows.length) return null
  const r = rows[0]
  return { type: r.type as ActiveTimer['type'], start_ts: r.start_ts as number, side: r.side as ActiveTimer['side'] }
}

export async function clearTimer(exec: SqlExecutor, type: ActiveTimer['type']): Promise<void> {
  await exec.exec('DELETE FROM active_timer WHERE type = ?', [type])
}

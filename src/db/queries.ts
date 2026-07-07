import type { SqlExecutor } from './executor'
import type {
  Entry, EntryType, Measurement, MeasurementType, ActiveTimer,
} from './types'

export type NewEntry =
  Omit<Entry, 'id' | 'created_at' | 'updated_at' | 'left_ms' | 'right_ms'>
  & { left_ms?: number | null; right_ms?: number | null }
export type NewMeasurement = Omit<Measurement, 'id' | 'created_at' | 'updated_at'>

const now = () => Date.now()

const ENTRY_COLS = [
  'type', 'start_ts', 'end_ts', 'side', 'amount_ml', 'milk_type', 'food',
  'diaper_kind', 'med_name', 'med_dose', 'note', 'photo_id', 'left_ms', 'right_ms',
] as const

export async function insertEntry(exec: SqlExecutor, data: NewEntry): Promise<number> {
  const ts = now()
  const cols = [...ENTRY_COLS, 'created_at', 'updated_at']
  const placeholders = cols.map(() => '?').join(', ')
  const values = [...ENTRY_COLS.map((c) => data[c] ?? null), ts, ts]
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

export async function startTimer(
  exec: SqlExecutor,
  t: { type: ActiveTimer['type']; start_ts: number; side: ActiveTimer['side'] },
): Promise<void> {
  await exec.exec(
    `INSERT INTO active_timer (type, start_ts, side, paused_ms, paused_at, left_ms, right_ms, running_since)
     VALUES (?, ?, ?, 0, NULL, 0, 0, NULL)
     ON CONFLICT(type) DO UPDATE SET start_ts = excluded.start_ts, side = excluded.side,
       paused_ms = 0, paused_at = NULL, left_ms = 0, right_ms = 0, running_since = NULL`,
    [t.type, t.start_ts, t.side],
  )
}

export async function setTimerStart(exec: SqlExecutor, type: ActiveTimer['type'], start_ts: number): Promise<void> {
  await exec.exec('UPDATE active_timer SET start_ts = ? WHERE type = ?', [start_ts, type])
}

export async function pauseTimer(exec: SqlExecutor, type: ActiveTimer['type'], now: number): Promise<void> {
  await exec.exec('UPDATE active_timer SET paused_at = ? WHERE type = ? AND paused_at IS NULL', [now, type])
}

export async function resumeTimer(exec: SqlExecutor, type: ActiveTimer['type'], now: number): Promise<void> {
  await exec.exec(
    'UPDATE active_timer SET paused_ms = paused_ms + (? - paused_at), paused_at = NULL WHERE type = ? AND paused_at IS NOT NULL',
    [now, type],
  )
}

export async function startBreastSide(
  exec: SqlExecutor, side: 'L' | 'R', now: number,
): Promise<void> {
  const rows = await exec.exec(
    'SELECT side, running_since FROM active_timer WHERE type = ?', ['breast'],
  )
  if (!rows.length) {
    await exec.exec(
      `INSERT INTO active_timer (type, start_ts, side, paused_ms, paused_at, left_ms, right_ms, running_since)
       VALUES ('breast', ?, ?, 0, NULL, 0, 0, ?)`,
      [now, side, now],
    )
  } else {
    const curSide = rows[0].side as 'L' | 'R' | null
    const runningSince = rows[0].running_since as number | null
    if (curSide && runningSince != null) {
      const col = curSide === 'L' ? 'left_ms' : 'right_ms'
      await exec.exec(
        `UPDATE active_timer SET ${col} = ${col} + (? - running_since) WHERE type = 'breast'`,
        [now],
      )
    }
    await exec.exec(
      `UPDATE active_timer SET side = ?, running_since = ? WHERE type = 'breast'`,
      [side, now],
    )
  }
  await setSetting(exec, 'breast_last_side', side)
}

export async function pauseBreastSide(exec: SqlExecutor, now: number): Promise<void> {
  const rows = await exec.exec(
    'SELECT side, running_since FROM active_timer WHERE type = ?', ['breast'],
  )
  if (!rows.length) return
  const curSide = rows[0].side as 'L' | 'R' | null
  const runningSince = rows[0].running_since as number | null
  if (!curSide || runningSince == null) return
  const col = curSide === 'L' ? 'left_ms' : 'right_ms'
  await exec.exec(
    `UPDATE active_timer SET ${col} = ${col} + (? - running_since), side = NULL, running_since = NULL WHERE type = 'breast'`,
    [now],
  )
}

export async function getActiveTimer(exec: SqlExecutor): Promise<ActiveTimer | null> {
  const rows = await exec.exec('SELECT * FROM active_timer LIMIT 1')
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

export async function clearTimer(exec: SqlExecutor, type: ActiveTimer['type']): Promise<void> {
  await exec.exec('DELETE FROM active_timer WHERE type = ?', [type])
}

/** Max updated_at across mutable tables; a cheap signature for "did anything change". */
export async function latestChangeMarker(exec: SqlExecutor): Promise<number> {
  const rows = await exec.exec(
    `SELECT MAX(m) AS marker FROM (
       SELECT MAX(updated_at) AS m FROM entries
       UNION ALL
       SELECT MAX(updated_at) AS m FROM measurements
     )`,
  )
  return (rows[0]?.marker as number | null) ?? 0
}

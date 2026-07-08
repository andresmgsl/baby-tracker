import type Database from 'better-sqlite3'

/**
 * One-time upgrade from the single-baby era to families. Idempotent:
 * - creates one baby under `legacyFamily` seeded from legacy baby_name/baby_dob
 * - backfills baby_id on entries/measurements/photos/active_timer
 * - moves settings_legacy rows into the scoped settings table
 * Runs only when legacy artifacts (settings_legacy / null baby_id rows) are present.
 */
export function migrateToFamilies(db: Database.Database, legacyFamily: string): void {
  const hasLegacySettings = tableExists(db, 'settings_legacy')
  // Count NULL-baby_id rows across ALL data tables — not just entries. A legacy DB can have
  // orphaned rows only in measurements or photos (e.g. no logged entries); missing those would
  // strand them forever, since nothing re-triggers this migration on a later open.
  const orphanRows = orphanDataRows(db)
  const orphanTimer = tableExists(db, 'active_timer_legacy')
  if (!hasLegacySettings && orphanRows === 0 && !orphanTimer) return // nothing to migrate

  const tx = db.transaction(() => {
    // 1. Seed baby from legacy settings (if any).
    let name = 'Baby'
    let dob: number | null = null
    if (hasLegacySettings) {
      const nameRow = db.prepare("SELECT value FROM settings_legacy WHERE key='baby_name'").get() as { value: string } | undefined
      const dobRow = db.prepare("SELECT value FROM settings_legacy WHERE key='baby_dob'").get() as { value: string } | undefined
      if (nameRow?.value) name = nameRow.value
      if (dobRow?.value) {
        const n = Number(dobRow.value)
        dob = Number.isFinite(n) ? n : new Date(dobRow.value).getTime() || null
      }
    }
    // Only create a baby if there is data to attach OR legacy settings existed.
    const now = firstTimestamp(db)
    const info = db.prepare(
      `INSERT INTO babies (family, name, dob, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
    ).run(legacyFamily, name, dob, now, now)
    const babyId = Number(info.lastInsertRowid)

    // 2. Backfill baby_id.
    for (const t of ['entries', 'measurements', 'photos']) {
      db.prepare(`UPDATE ${t} SET baby_id = ? WHERE baby_id IS NULL`).run(babyId)
    }

    // 3. Move legacy active_timer rows.
    if (orphanTimer) {
      const rows = db.prepare('SELECT * FROM active_timer_legacy').all() as Record<string, unknown>[]
      const ins = db.prepare(
        `INSERT OR IGNORE INTO active_timer (baby_id, type, start_ts, side, paused_ms, paused_at, left_ms, right_ms, running_since)
         VALUES (@baby_id, @type, @start_ts, @side, @paused_ms, @paused_at, @left_ms, @right_ms, @running_since)`,
      )
      for (const r of rows) ins.run({ baby_id: babyId, side: null, paused_ms: 0, paused_at: null, left_ms: 0, right_ms: 0, running_since: null, ...r })
      db.exec('DROP TABLE active_timer_legacy')
    }

    // 4. Move legacy settings into scoped settings.
    if (hasLegacySettings) {
      const rows = db.prepare('SELECT key, value FROM settings_legacy').all() as { key: string, value: string }[]
      const put = db.prepare('INSERT OR REPLACE INTO settings (scope, key, value) VALUES (?, ?, ?)')
      for (const { key, value } of rows) {
        if (key === 'baby_name' || key === 'baby_dob') continue // now on the baby row
        const scope = key === 'breast_last_side' ? `baby:${babyId}` : legacyFamily
        put.run(scope, key, value)
      }
      db.exec('DROP TABLE settings_legacy')
    }
  })
  tx()
}

function tableExists(db: Database.Database, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)
}

function orphanDataRows(db: Database.Database): number {
  let total = 0
  for (const t of ['entries', 'measurements', 'photos']) {
    total += (db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE baby_id IS NULL`).get() as { c: number }).c
  }
  return total
}

function firstTimestamp(db: Database.Database): number {
  const row = db.prepare('SELECT MIN(created_at) m FROM entries').get() as { m: number | null }
  return row.m ?? 0
}

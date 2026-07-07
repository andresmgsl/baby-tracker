import Database from 'better-sqlite3'
import { migrateToFamilies } from './migrate.ts'
import { openStore } from './store.ts'

function legacyDb() {
  // Build a pre-families DB shape, then run store upgrades to add new columns/tables.
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE entries (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL,
      start_ts INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE measurements (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL,
      ts INTEGER NOT NULL, value REAL NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE photos (id INTEGER PRIMARY KEY AUTOINCREMENT, blob BLOB NOT NULL, mime TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE active_timer (type TEXT PRIMARY KEY, start_ts INTEGER NOT NULL, side TEXT,
      paused_ms INTEGER NOT NULL DEFAULT 0, paused_at INTEGER, left_ms INTEGER NOT NULL DEFAULT 0,
      right_ms INTEGER NOT NULL DEFAULT 0, running_since INTEGER);
    INSERT INTO entries (type, start_ts, created_at, updated_at) VALUES ('sleep', 100, 100, 100);
    INSERT INTO measurements (type, ts, value, created_at, updated_at) VALUES ('weight', 50, 4.2, 50, 50);
    INSERT INTO settings (key, value) VALUES ('baby_name','Mateo'),('baby_dob','1700000000000'),('units','oz'),('breast_last_side','L');
    INSERT INTO active_timer (type, start_ts) VALUES ('sleep', 100);
  `)
  return db
}

test('migration creates legacy baby and backfills everything', () => {
  const db = legacyDb()
  // Reuse the store's schema upgraders by opening over the same file is not possible in :memory:;
  // instead apply the same ALTERs the store would (mirrors ensure* funcs):
  db.exec("ALTER TABLE entries ADD COLUMN baby_id INTEGER")
  db.exec("ALTER TABLE measurements ADD COLUMN baby_id INTEGER")
  db.exec("ALTER TABLE photos ADD COLUMN baby_id INTEGER")
  db.exec(`ALTER TABLE settings RENAME TO settings_legacy;
    CREATE TABLE settings (scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(scope,key));`)
  db.exec(`CREATE TABLE babies (id INTEGER PRIMARY KEY AUTOINCREMENT, family TEXT NOT NULL, name TEXT NOT NULL,
    dob INTEGER, archived_at INTEGER, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`)
  db.exec(`ALTER TABLE active_timer RENAME TO active_timer_legacy;
    CREATE TABLE active_timer (baby_id INTEGER NOT NULL, type TEXT NOT NULL, start_ts INTEGER NOT NULL, side TEXT,
      paused_ms INTEGER NOT NULL DEFAULT 0, paused_at INTEGER, left_ms INTEGER NOT NULL DEFAULT 0,
      right_ms INTEGER NOT NULL DEFAULT 0, running_since INTEGER, PRIMARY KEY(baby_id,type));`)

  migrateToFamilies(db, 'lopez')

  const baby = db.prepare('SELECT * FROM babies').get() as any
  expect(baby.family).toBe('lopez')
  expect(baby.name).toBe('Mateo')
  expect(baby.dob).toBe(1700000000000)
  expect((db.prepare('SELECT baby_id FROM entries').get() as any).baby_id).toBe(baby.id)
  expect((db.prepare('SELECT baby_id FROM measurements').get() as any).baby_id).toBe(baby.id)
  expect((db.prepare('SELECT baby_id FROM active_timer').get() as any).baby_id).toBe(baby.id)
  expect((db.prepare("SELECT value FROM settings WHERE scope='lopez' AND key='units'").get() as any).value).toBe('oz')
  expect((db.prepare("SELECT value FROM settings WHERE scope=? AND key='breast_last_side'").get('baby:'+baby.id) as any).value).toBe('L')

  // Idempotent: a second run creates no extra baby, no errors.
  migrateToFamilies(db, 'lopez')
  expect((db.prepare('SELECT COUNT(*) c FROM babies').get() as any).c).toBe(1)
})

test('migration with no legacy data creates no baby', () => {
  const store = openStore(':memory:') // fresh, no settings_legacy
  // openStore already ran migrateToFamilies internally (see Task 3 Step 3); assert empty.
  expect((store.exec('SELECT COUNT(*) c FROM babies')[0] as any).c).toBe(0)
  store.close()
})

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS babies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family TEXT NOT NULL,
  name TEXT NOT NULL,
  dob INTEGER,
  archived_at INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_babies_family ON babies(family);

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  baby_id INTEGER,
  type TEXT NOT NULL,
  start_ts INTEGER NOT NULL,
  end_ts INTEGER,
  side TEXT,
  amount_ml REAL,
  milk_type TEXT,
  food TEXT,
  diaper_kind TEXT,
  med_name TEXT,
  med_dose TEXT,
  note TEXT,
  photo_id INTEGER,
  left_ms INTEGER,
  right_ms INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_baby_start ON entries(baby_id, start_ts);

CREATE TABLE IF NOT EXISTS measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  baby_id INTEGER,
  type TEXT NOT NULL,
  ts INTEGER NOT NULL,
  value REAL NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_measurements_baby_type_ts ON measurements(baby_id, type, ts);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  baby_id INTEGER,
  blob BLOB NOT NULL,
  mime TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (scope, key)
);

CREATE TABLE IF NOT EXISTS active_timer (
  baby_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  start_ts INTEGER NOT NULL,
  side TEXT,
  paused_ms INTEGER NOT NULL DEFAULT 0,
  paused_at INTEGER,
  left_ms INTEGER NOT NULL DEFAULT 0,
  right_ms INTEGER NOT NULL DEFAULT 0,
  running_since INTEGER,
  PRIMARY KEY (baby_id, type)
);
`

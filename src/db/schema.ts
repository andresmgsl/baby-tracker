export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_start ON entries(start_ts);

CREATE TABLE IF NOT EXISTS measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  ts INTEGER NOT NULL,
  value REAL NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_measurements_type_ts ON measurements(type, ts);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blob BLOB NOT NULL,
  mime TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS active_timer (
  type TEXT PRIMARY KEY,
  start_ts INTEGER NOT NULL,
  side TEXT
);
`

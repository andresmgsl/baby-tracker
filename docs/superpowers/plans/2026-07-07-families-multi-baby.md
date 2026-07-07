# Families & Multiple Babies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-baby app into a multi-family, multi-baby app where each family sees only its own babies, switches the active baby from a sidebar, and cannot access another family's data (enforced server-side).

**Architecture:** A new `babies` table (owned by an env-defined `family` key) with `baby_id` foreign keys on `entries`/`measurements`/`photos`, per-`(baby_id,type)` timers, and per-`(scope,key)` settings. The open raw-SQL endpoint (`/api/exec`) is replaced by a **named-query registry** (`server/queries.ts`): the server owns all SQL and injects family/baby scope. The active baby travels in an `X-Baby-Id` header, validated against the session's family on every baby-scoped call. The client keeps its `useDb()`/`queries.ts` shape — `useDb()` returns an `Api` (`q`/`tx`/`exportBytes`/`importBytes`) and `queries.ts` functions become thin `db.q('name', args)` wrappers, so component call sites don't change.

**Tech Stack:** React 18 + TypeScript, Vite 6, Node built-in `http`, `better-sqlite3`, Vitest + Testing Library. No new runtime dependencies.

## Global Constraints

- **No new runtime npm dependencies** — Node built-ins + `better-sqlite3` only.
- **Server-enforced isolation is a hard requirement** — a family must never read or write another family's baby data, even by crafting requests. Any baby-scoped query without a valid, family-owned `X-Baby-Id` → HTTP 403.
- **Preserve existing data** — migration must move all current rows onto the legacy family's first baby without loss; migration must be idempotent.
- **`BT_USERS` format** (verbatim): `name:family=KEY:scrypt$salt$hash` comma-separated. Base64 padding (`=`) only appears trailing inside the hash.
- **Session cookie stores only the username**; family is resolved from `BT_USERS` on each request.
- **Test command:** `npx vitest run <path>` (single file) or `npx vitest run <path> -t "<name>"` (single test). Full suite: `npm test`.
- **Commit after every task** (each task ends green).
- Follow existing code style: 2-space indent, no semicolons omitted inconsistently (match surrounding files), single quotes, `type`-only imports where used.

## Query Registry Contract (referenced by all Milestone-2/3 tasks)

Every server query has a **name**, a **scope** (`'baby'` needs a validated `X-Baby-Id`; `'family'` uses the session family only), an **args** shape, and a **returns** shape. Client `queries.ts` wrappers call `db.q('<name>', args)` and cast the result.

Baby-scoped (`scope: 'baby'`, ctx has `babyId: number`):

| name | args | returns |
|------|------|---------|
| `insertEntry` | `NewEntry` | `[{ id }]` |
| `listEntries` | `{ type?: EntryType; limit?: number }` | `Entry[]` |
| `listEntriesBetween` | `{ fromTs: number; toTs: number }` | `Entry[]` |
| `lastEntryByType` | `{ type: EntryType }` | `Entry[]` (0–1) |
| `updateEntry` | `{ id: number; patch: Partial<NewEntry> }` | `[]` |
| `deleteEntry` | `{ id: number }` | `[]` |
| `insertMeasurement` | `NewMeasurement` | `[{ id }]` |
| `listMeasurements` | `{ type: MeasurementType }` | `Measurement[]` |
| `deleteMeasurement` | `{ id: number }` | `[]` |
| `startTimer` | `{ type; start_ts; side }` | `[]` |
| `setTimerStart` | `{ type; start_ts }` | `[]` |
| `pauseTimer` | `{ type; now }` | `[]` |
| `resumeTimer` | `{ type; now }` | `[]` |
| `startBreastSide` | `{ side: 'L'\|'R'; now }` | `[]` |
| `pauseBreastSide` | `{ now }` | `[]` |
| `getActiveTimer` | `{}` | active_timer rows (0–1) |
| `clearTimer` | `{ type }` | `[]` |
| `latestChangeMarker` | `{}` | `[{ marker }]` |

Family-scoped (`scope: 'family'`, ctx has `family: string`):

| name | args | returns |
|------|------|---------|
| `getSetting` | `{ key: string }` | `[{ value }]` (0–1) |
| `setSetting` | `{ key: string; value: string }` | `[]` |
| `listBabies` | `{ includeArchived?: boolean }` | `Baby[]` |
| `addBaby` | `{ name: string; dob: number \| null }` | `[{ id }]` |
| `renameBaby` | `{ id: number; name: string }` | `[]` |
| `setBabyDob` | `{ id: number; dob: number \| null }` | `[]` |
| `archiveBaby` | `{ id: number }` | `[]` |
| `unarchiveBaby` | `{ id: number }` | `[]` |

Shared types (defined in Task 4 / Task 7):
```ts
export interface Baby {
  id: number; family: string; name: string; dob: number | null;
  archived_at: number | null; sort_order: number;
  created_at: number; updated_at: number;
}
```

---

# Milestone 1 — Server: auth family tags, schema, migration

After this milestone the server has families, a `babies` table, `baby_id` on all data, and existing data migrated to the legacy family's first baby. The old `/api/exec` still works (still raw) — it is removed in Task 8.

## Task 1: Family-tagged users (`parseUsers`) + family resolution

**Files:**
- Modify: `server/auth.ts` (Users type, `parseUsers`)
- Modify: `server/app.ts:56-83` (login reads `.hash`; add `familyOf` helper)
- Test: `server/auth.test.ts`

**Interfaces:**
- Produces: `type UserRecord = { family: string; hash: string }`; `type Users = Map<string, UserRecord>`; `parseUsers(raw?: string): Users`.

- [ ] **Step 1: Write failing tests** in `server/auth.test.ts` (append):

```ts
import { parseUsers } from './auth.ts'

test('parseUsers extracts family tag and hash', () => {
  const raw = 'andres:family=lopez:scrypt$c2FsdA==$aGFzaA==,mara:family=nunez:scrypt$c2E=$aA=='
  const users = parseUsers(raw)
  expect(users.get('andres')).toEqual({ family: 'lopez', hash: 'scrypt$c2FsdA==$aGFzaA==' })
  expect(users.get('mara')).toEqual({ family: 'nunez', hash: 'scrypt$c2E=$aA==' })
})

test('parseUsers skips entries without a family tag', () => {
  const users = parseUsers('legacy:scrypt$c2E=$aA==')
  expect(users.has('legacy')).toBe(false)
})

test('parseUsers handles empty / undefined', () => {
  expect(parseUsers(undefined).size).toBe(0)
  expect(parseUsers('').size).toBe(0)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run server/auth.test.ts`
Expected: FAIL (`parseUsers` returns strings, not `{family,hash}`).

- [ ] **Step 3: Rewrite `parseUsers` and the `Users` type** in `server/auth.ts` (replace lines 26-39):

```ts
export interface UserRecord { family: string; hash: string }
export type Users = Map<string, UserRecord>

// BT_USERS format: "name:family=KEY:scrypt$salt$hash,..."
// Split first ':' for the name; the remainder must start with 'family=';
// take up to the next ':' as the family key, the rest is the scrypt hash.
export function parseUsers(raw: string | undefined): Users {
  const users: Users = new Map()
  if (!raw) return users
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const nameIdx = trimmed.indexOf(':')
    if (nameIdx <= 0) continue
    const name = trimmed.slice(0, nameIdx)
    const rest = trimmed.slice(nameIdx + 1)
    if (!rest.startsWith('family=')) continue
    const afterTag = rest.slice('family='.length)
    const famIdx = afterTag.indexOf(':')
    if (famIdx <= 0) continue
    const family = afterTag.slice(0, famIdx)
    const hash = afterTag.slice(famIdx + 1)
    if (!hash) continue
    users.set(name, { family, hash })
  }
  return users
}
```

- [ ] **Step 4: Fix the login handler** in `server/app.ts`. Replace line 70-71:

```ts
        const record = typeof username === 'string' ? users.get(username) : undefined
        if (!record || typeof password !== 'string' || !verifyPassword(password, record.hash)) {
```

Add a `familyOf` helper right after `userOf` (after line 60):

```ts
  const familyOf = (req: IncomingMessage): string | null => {
    const user = userOf(req)
    return user ? users.get(user)?.family ?? null : null
  }
```

(`familyOf` is consumed in Task 8; it is fine to add it now and leave it unused until then — TypeScript `noUnusedLocals` is off for this pattern in the repo, but if the build complains, add `void familyOf` is NOT needed; instead defer adding it to Task 8. Check: run `npm run build` — if it errors on unused, move this helper to Task 8.)

- [ ] **Step 5: Verify** — `npx vitest run server/auth.test.ts` and `npm run build`. Existing `app.test.ts` may reference the old `BT_USERS` format; update those fixtures to the new format now (search `app.test.ts` for `scrypt$` login fixtures and prepend `family=testfam:`). Run `npx vitest run server/app.test.ts`.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/auth.ts server/auth.test.ts server/app.ts server/app.test.ts
git commit -m "feat(server): family-tagged BT_USERS parsing"
```

## Task 2: Schema — babies table, baby_id columns, scoped settings & timers

**Files:**
- Modify: `src/db/schema.ts` (`SCHEMA_SQL`)
- Modify: `server/store.ts` (idempotent column/table migrations)
- Test: `server/store.test.ts`

**Interfaces:**
- Produces: tables `babies`, `entries.baby_id`, `measurements.baby_id`, `photos.baby_id`, `settings(scope,key)` PK, `active_timer(baby_id,type)` PK.

- [ ] **Step 1: Update `SCHEMA_SQL`** in `src/db/schema.ts`. This defines the *target* shape for fresh DBs; the store migration (Step 3) upgrades existing DBs. Replace the file contents:

```ts
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
```

Note: `baby_id` is nullable in DDL so the migration can add the column to existing tables (SQLite can't add a NOT NULL column without a default); non-null is enforced by the app layer (all inserts set it).

- [ ] **Step 2: Write failing test** in `server/store.test.ts` (append):

```ts
import { openStore } from './store.ts'

test('fresh store has babies table and baby_id columns', () => {
  const store = openStore(':memory:')
  const cols = (name: string) =>
    new Set(store.exec(`PRAGMA table_info(${name})`).map((r) => r.name as string))
  expect(cols('babies').has('family')).toBe(true)
  expect(cols('entries').has('baby_id')).toBe(true)
  expect(cols('measurements').has('baby_id')).toBe(true)
  expect(cols('photos').has('baby_id')).toBe(true)
  const settingsPk = store.exec('PRAGMA table_info(settings)').filter((r) => (r.pk as number) > 0)
  expect(new Set(settingsPk.map((r) => r.name))).toEqual(new Set(['scope', 'key']))
  store.close()
})
```

- [ ] **Step 3: Add idempotent migrations** in `server/store.ts`. Add these functions above `openStore`:

```ts
function ensureBabyColumns(db: Database.Database): void {
  for (const table of ['entries', 'measurements', 'photos']) {
    const names = new Set(
      (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name),
    )
    if (!names.has('baby_id')) db.exec(`ALTER TABLE ${table} ADD COLUMN baby_id INTEGER`)
  }
}

function ensureSettingsScope(db: Database.Database): void {
  const cols = (db.prepare('PRAGMA table_info(settings)').all() as { name: string }[]).map((c) => c.name)
  if (cols.includes('scope')) return
  // Legacy settings(key PRIMARY KEY, value). Rebuild with (scope,key) PK.
  db.exec(`
    ALTER TABLE settings RENAME TO settings_legacy;
    CREATE TABLE settings (
      scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
      PRIMARY KEY (scope, key)
    );
  `)
  // Leave settings_legacy in place for the data migration (Task 3) to consume.
}

function ensureActiveTimerBaby(db: Database.Database): void {
  const cols = (db.prepare('PRAGMA table_info(active_timer)').all() as { name: string, pk: number }[])
  if (cols.some((c) => c.name === 'baby_id')) return
  // Legacy active_timer had PK(type). Rebuild with PK(baby_id,type); rows get baby_id in Task 3.
  db.exec(`
    ALTER TABLE active_timer RENAME TO active_timer_legacy;
    CREATE TABLE active_timer (
      baby_id INTEGER NOT NULL, type TEXT NOT NULL, start_ts INTEGER NOT NULL, side TEXT,
      paused_ms INTEGER NOT NULL DEFAULT 0, paused_at INTEGER,
      left_ms INTEGER NOT NULL DEFAULT 0, right_ms INTEGER NOT NULL DEFAULT 0,
      running_since INTEGER, PRIMARY KEY (baby_id, type)
    );
  `)
}
```

Wire them into `openStore` (after `db.exec(SCHEMA_SQL)` and the existing `ensure*` calls, both in the initial open and inside `replace`):

```ts
  db.exec(SCHEMA_SQL)
  ensureActiveTimerColumns(db)
  ensureEntriesColumns(db)
  ensureBabyColumns(db)
  ensureSettingsScope(db)
  ensureActiveTimerBaby(db)
```

Order matters: `db.exec(SCHEMA_SQL)` creates the target `settings`/`active_timer` only if they don't exist. On a legacy DB they already exist with the old shape, so `ensureSettingsScope`/`ensureActiveTimerBaby` detect and rebuild them. On a fresh DB the columns already match and the `ensure*` functions early-return.

- [ ] **Step 4: Verify** — `npx vitest run server/store.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts server/store.ts server/store.test.ts
git commit -m "feat(server): babies table + baby_id/scoped-settings/per-baby-timer schema"
```

## Task 3: One-time data migration to the legacy baby

**Files:**
- Create: `server/migrate.ts` (`migrateToFamilies`)
- Modify: `server/store.ts` (call migration in `openStore`), `server/index.ts` (pass `LEGACY_FAMILY`)
- Test: `server/migrate.test.ts`

**Interfaces:**
- Consumes: a `Database.Database` and a `legacyFamily` string.
- Produces: `migrateToFamilies(db: Database.Database, legacyFamily: string): void` — idempotent; creates one baby under `legacyFamily`, backfills all `baby_id`s, moves `settings_legacy`/timer rows.

- [ ] **Step 1: Write failing test** in `server/migrate.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run server/migrate.test.ts`. Expected: FAIL (`migrate.ts` missing).

- [ ] **Step 3: Implement** `server/migrate.ts`:

```ts
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
  const orphanRows = (db.prepare(
    "SELECT COUNT(*) c FROM entries WHERE baby_id IS NULL",
  ).get() as { c: number }).c
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

function firstTimestamp(db: Database.Database): number {
  const row = db.prepare('SELECT MIN(created_at) m FROM entries').get() as { m: number | null }
  return row.m ?? 0
}
```

- [ ] **Step 4: Call migration from `openStore`** in `server/store.ts`. Import at top: `import { migrateToFamilies } from './migrate.ts'`. Add a `legacyFamily` param to `openStore`:

```ts
export function openStore(dbPath: string, legacyFamily = 'family'): Store {
```

After the `ensure*` calls (both in initial open and inside `replace`), add:

```ts
  migrateToFamilies(db, legacyFamily)
```

- [ ] **Step 5: Pass `LEGACY_FAMILY` from `server/index.ts`.** After `const users = parseUsers(...)` add:

```ts
const legacyFamily = process.env.LEGACY_FAMILY
  || [...users.values()][0]?.family
  || 'family'
```

Change `const store = openStore(dbPath)` → `const store = openStore(dbPath, legacyFamily)`.

- [ ] **Step 6: Verify** — `npx vitest run server/migrate.test.ts server/store.test.ts`. Expected: PASS. Then `npm run build:server` to confirm the server bundles.

- [ ] **Step 7: Commit**

```bash
git add server/migrate.ts server/migrate.test.ts server/store.ts server/index.ts
git commit -m "feat(server): one-time migration of legacy data onto the legacy family's baby"
```

---

# Milestone 2 — Server: named-query registry & dispatch

After this milestone the server exposes `/api/q` and `/api/qtx`, owns all SQL with family/baby scope injected, validates `X-Baby-Id`, and 403s cross-family access. `/api/exec` and `/api/tx` are removed.

## Task 4: Registry scaffolding + entries queries

**Files:**
- Create: `server/queries.ts` (registry, types, entries handlers)
- Test: `server/queries.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface QueryDb { run(sql: string, params?: unknown[]): Row[] }
  export interface QueryCtx { family: string; babyId: number }
  export type QueryScope = 'baby' | 'family'
  export interface QueryDef { scope: QueryScope; run(db: QueryDb, ctx: QueryCtx, args: any): Row[] }
  export const QUERIES: Record<string, QueryDef>
  ```
  `QueryCtx.babyId` is always a valid family-owned id for `scope: 'baby'` queries (validated by the dispatcher); for `scope: 'family'` queries `babyId` is `-1` (unused).

- [ ] **Step 1: Write failing tests** in `server/queries.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run server/queries.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `server/queries.ts` with registry types + entries handlers:

```ts
import type { Row } from './store.ts'

export interface QueryDb { run(sql: string, params?: unknown[]): Row[] }
export interface QueryCtx { family: string; babyId: number }
export type QueryScope = 'baby' | 'family'
export interface QueryDef { scope: QueryScope; run(db: QueryDb, ctx: QueryCtx, args: any): Row[] }

const now = () => Date.now()

const ENTRY_COLS = [
  'type', 'start_ts', 'end_ts', 'side', 'amount_ml', 'milk_type', 'food',
  'diaper_kind', 'med_name', 'med_dose', 'note', 'photo_id', 'left_ms', 'right_ms',
] as const

export const QUERIES: Record<string, QueryDef> = {
  insertEntry: {
    scope: 'baby',
    run(db, ctx, data) {
      const ts = now()
      const cols = ['baby_id', ...ENTRY_COLS, 'created_at', 'updated_at']
      const placeholders = cols.map(() => '?').join(', ')
      const values = [ctx.babyId, ...ENTRY_COLS.map((c) => data[c] ?? null), ts, ts]
      return db.run(
        `INSERT INTO entries (${cols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
        values,
      )
    },
  },
  listEntries: {
    scope: 'baby',
    run(db, ctx, opts) {
      const typeClause = opts.type ? 'AND type = ?' : ''
      const limit = opts.limit ? `LIMIT ${Number(opts.limit)}` : ''
      const params = opts.type ? [ctx.babyId, opts.type] : [ctx.babyId]
      return db.run(
        `SELECT * FROM entries WHERE baby_id = ? ${typeClause} ORDER BY start_ts DESC ${limit}`,
        params,
      )
    },
  },
  listEntriesBetween: {
    scope: 'baby',
    run(db, ctx, { fromTs, toTs }) {
      return db.run(
        'SELECT * FROM entries WHERE baby_id = ? AND start_ts >= ? AND start_ts <= ? ORDER BY start_ts DESC',
        [ctx.babyId, fromTs, toTs],
      )
    },
  },
  lastEntryByType: {
    scope: 'baby',
    run(db, ctx, { type }) {
      return db.run(
        'SELECT * FROM entries WHERE baby_id = ? AND type = ? ORDER BY start_ts DESC LIMIT 1',
        [ctx.babyId, type],
      )
    },
  },
  updateEntry: {
    scope: 'baby',
    run(db, ctx, { id, patch }) {
      const keys = Object.keys(patch)
      if (keys.length === 0) return []
      const set = keys.map((k) => `${k} = ?`).join(', ')
      const values = keys.map((k) => patch[k])
      return db.run(
        `UPDATE entries SET ${set}, updated_at = ? WHERE id = ? AND baby_id = ?`,
        [...values, now(), id, ctx.babyId],
      )
    },
  },
  deleteEntry: {
    scope: 'baby',
    run(db, ctx, { id }) {
      return db.run('DELETE FROM entries WHERE id = ? AND baby_id = ?', [id, ctx.babyId])
    },
  },
}
```

- [ ] **Step 4: Verify** — `npx vitest run server/queries.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/queries.ts server/queries.test.ts
git commit -m "feat(server): query registry + baby-scoped entries queries"
```

## Task 5: Measurements + settings queries

**Files:**
- Modify: `server/queries.ts` (add handlers)
- Test: `server/queries.test.ts` (append)

**Interfaces:**
- Consumes: `QUERIES`, `QueryDb`, `QueryCtx` from Task 4.
- Produces: `insertMeasurement`, `listMeasurements`, `deleteMeasurement` (baby); `getSetting`, `setSetting` (family).

- [ ] **Step 1: Append failing tests** to `server/queries.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run server/queries.test.ts -t "measurements are baby-scoped"`. Expected: FAIL.

- [ ] **Step 3: Add handlers** to `QUERIES` in `server/queries.ts`:

```ts
  insertMeasurement: {
    scope: 'baby',
    run(db, ctx, data) {
      const ts = now()
      return db.run(
        `INSERT INTO measurements (baby_id, type, ts, value, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [ctx.babyId, data.type, data.ts, data.value, data.note ?? null, ts, ts],
      )
    },
  },
  listMeasurements: {
    scope: 'baby',
    run(db, ctx, { type }) {
      return db.run(
        'SELECT * FROM measurements WHERE baby_id = ? AND type = ? ORDER BY ts ASC',
        [ctx.babyId, type],
      )
    },
  },
  deleteMeasurement: {
    scope: 'baby',
    run(db, ctx, { id }) {
      return db.run('DELETE FROM measurements WHERE id = ? AND baby_id = ?', [id, ctx.babyId])
    },
  },
  getSetting: {
    scope: 'family',
    run(db, ctx, { key }) {
      return db.run('SELECT value FROM settings WHERE scope = ? AND key = ?', [ctx.family, key])
    },
  },
  setSetting: {
    scope: 'family',
    run(db, ctx, { key, value }) {
      return db.run(
        `INSERT INTO settings (scope, key, value) VALUES (?, ?, ?)
         ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
        [ctx.family, key, value],
      )
    },
  },
```

- [ ] **Step 4: Verify** — `npx vitest run server/queries.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/queries.ts server/queries.test.ts
git commit -m "feat(server): measurements (baby) + settings (family) queries"
```

## Task 6: Timer queries + change marker (baby-scoped)

**Files:**
- Modify: `server/queries.ts`
- Test: `server/queries.test.ts` (append)

**Interfaces:**
- Produces: `startTimer`, `setTimerStart`, `pauseTimer`, `resumeTimer`, `startBreastSide`, `pauseBreastSide`, `getActiveTimer`, `clearTimer`, `latestChangeMarker` (all baby-scoped). `breast_last_side` is written to `settings` under scope `baby:<id>`.

- [ ] **Step 1: Append failing tests**:

```ts
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

test('latestChangeMarker reflects only this baby', () => {
  const { qdb, ctx, babyId } = harness()
  QUERIES.insertEntry.run(qdb, ctx, { type: 'sleep', start_ts: 10 })
  const mine = Number(QUERIES.latestChangeMarker.run(qdb, ctx, {})[0].marker)
  const other = Number(QUERIES.latestChangeMarker.run(qdb, { ...ctx, babyId: babyId + 1 }, {})[0].marker)
  expect(mine).toBeGreaterThan(0)
  expect(other).toBe(0)
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run server/queries.test.ts -t "timers are isolated"`. Expected: FAIL.

- [ ] **Step 3: Add handlers.** These port `src/db/queries.ts` timer logic, scoped by `baby_id`:

```ts
  startTimer: {
    scope: 'baby',
    run(db, ctx, { type, start_ts, side }) {
      return db.run(
        `INSERT INTO active_timer (baby_id, type, start_ts, side, paused_ms, paused_at, left_ms, right_ms, running_since)
         VALUES (?, ?, ?, ?, 0, NULL, 0, 0, NULL)
         ON CONFLICT(baby_id, type) DO UPDATE SET start_ts = excluded.start_ts, side = excluded.side,
           paused_ms = 0, paused_at = NULL, left_ms = 0, right_ms = 0, running_since = NULL`,
        [ctx.babyId, type, start_ts, side ?? null],
      )
    },
  },
  setTimerStart: {
    scope: 'baby',
    run(db, ctx, { type, start_ts }) {
      return db.run('UPDATE active_timer SET start_ts = ? WHERE baby_id = ? AND type = ?', [start_ts, ctx.babyId, type])
    },
  },
  pauseTimer: {
    scope: 'baby',
    run(db, ctx, { type, now: t }) {
      return db.run(
        'UPDATE active_timer SET paused_at = ? WHERE baby_id = ? AND type = ? AND paused_at IS NULL',
        [t, ctx.babyId, type],
      )
    },
  },
  resumeTimer: {
    scope: 'baby',
    run(db, ctx, { type, now: t }) {
      return db.run(
        'UPDATE active_timer SET paused_ms = paused_ms + (? - paused_at), paused_at = NULL WHERE baby_id = ? AND type = ? AND paused_at IS NOT NULL',
        [t, ctx.babyId, type],
      )
    },
  },
  startBreastSide: {
    scope: 'baby',
    run(db, ctx, { side, now: t }) {
      const rows = db.run('SELECT side, running_since FROM active_timer WHERE baby_id = ? AND type = ?', [ctx.babyId, 'breast'])
      if (!rows.length) {
        db.run(
          `INSERT INTO active_timer (baby_id, type, start_ts, side, paused_ms, paused_at, left_ms, right_ms, running_since)
           VALUES (?, 'breast', ?, ?, 0, NULL, 0, 0, ?)`,
          [ctx.babyId, t, side, t],
        )
      } else {
        const curSide = rows[0].side as 'L' | 'R' | null
        const runningSince = rows[0].running_since as number | null
        if (curSide && runningSince != null) {
          const col = curSide === 'L' ? 'left_ms' : 'right_ms'
          db.run(`UPDATE active_timer SET ${col} = ${col} + (? - running_since) WHERE baby_id = ? AND type = 'breast'`, [t, ctx.babyId])
        }
        db.run(`UPDATE active_timer SET side = ?, running_since = ? WHERE baby_id = ? AND type = 'breast'`, [side, t, ctx.babyId])
      }
      db.run(
        `INSERT INTO settings (scope, key, value) VALUES (?, 'breast_last_side', ?)
         ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
        [`baby:${ctx.babyId}`, side],
      )
      return []
    },
  },
  pauseBreastSide: {
    scope: 'baby',
    run(db, ctx, { now: t }) {
      const rows = db.run('SELECT side, running_since FROM active_timer WHERE baby_id = ? AND type = ?', [ctx.babyId, 'breast'])
      if (!rows.length) return []
      const curSide = rows[0].side as 'L' | 'R' | null
      const runningSince = rows[0].running_since as number | null
      if (!curSide || runningSince == null) return []
      const col = curSide === 'L' ? 'left_ms' : 'right_ms'
      db.run(
        `UPDATE active_timer SET ${col} = ${col} + (? - running_since), side = NULL, running_since = NULL WHERE baby_id = ? AND type = 'breast'`,
        [t, ctx.babyId],
      )
      return []
    },
  },
  getActiveTimer: {
    scope: 'baby',
    run(db, ctx) {
      return db.run('SELECT * FROM active_timer WHERE baby_id = ? LIMIT 1', [ctx.babyId])
    },
  },
  clearTimer: {
    scope: 'baby',
    run(db, ctx, { type }) {
      return db.run('DELETE FROM active_timer WHERE baby_id = ? AND type = ?', [ctx.babyId, type])
    },
  },
  latestChangeMarker: {
    scope: 'baby',
    run(db, ctx) {
      return db.run(
        `SELECT MAX(m) AS marker FROM (
           SELECT MAX(updated_at) AS m FROM entries WHERE baby_id = ?
           UNION ALL
           SELECT MAX(updated_at) AS m FROM measurements WHERE baby_id = ?
         )`,
        [ctx.babyId, ctx.babyId],
      )
    },
  },
```

Note: `latestChangeMarker` may return `[{ marker: null }]` when the baby has no rows; the client wrapper coerces `null → 0` (Task 10).

- [ ] **Step 4: Verify** — `npx vitest run server/queries.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/queries.ts server/queries.test.ts
git commit -m "feat(server): per-baby timer queries + change marker"
```

## Task 7: Baby-management queries (family-scoped)

**Files:**
- Modify: `server/queries.ts`
- Test: `server/queries.test.ts` (append)

**Interfaces:**
- Produces: `listBabies`, `addBaby`, `renameBaby`, `setBabyDob`, `archiveBaby`, `unarchiveBaby` (all `scope: 'family'`; mutations verify `family` ownership).

- [ ] **Step 1: Append failing tests**:

```ts
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
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run server/queries.test.ts -t "babies are family-scoped"`. Expected: FAIL.

- [ ] **Step 3: Add handlers**:

```ts
  listBabies: {
    scope: 'family',
    run(db, ctx, { includeArchived } = {}) {
      const where = includeArchived ? '' : 'AND archived_at IS NULL'
      return db.run(
        `SELECT * FROM babies WHERE family = ? ${where} ORDER BY archived_at IS NOT NULL, sort_order, created_at`,
        [ctx.family],
      )
    },
  },
  addBaby: {
    scope: 'family',
    run(db, ctx, { name, dob }) {
      const ts = now()
      const next = db.run('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM babies WHERE family = ?', [ctx.family])
      return db.run(
        `INSERT INTO babies (family, name, dob, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        [ctx.family, name, dob ?? null, next[0].n, ts, ts],
      )
    },
  },
  renameBaby: {
    scope: 'family',
    run(db, ctx, { id, name }) {
      return db.run('UPDATE babies SET name = ?, updated_at = ? WHERE id = ? AND family = ?', [name, now(), id, ctx.family])
    },
  },
  setBabyDob: {
    scope: 'family',
    run(db, ctx, { id, dob }) {
      return db.run('UPDATE babies SET dob = ?, updated_at = ? WHERE id = ? AND family = ?', [dob ?? null, now(), id, ctx.family])
    },
  },
  archiveBaby: {
    scope: 'family',
    run(db, ctx, { id }) {
      return db.run('UPDATE babies SET archived_at = ?, updated_at = ? WHERE id = ? AND family = ?', [now(), now(), id, ctx.family])
    },
  },
  unarchiveBaby: {
    scope: 'family',
    run(db, ctx, { id }) {
      return db.run('UPDATE babies SET archived_at = NULL, updated_at = ? WHERE id = ? AND family = ?', [now(), id, ctx.family])
    },
  },
```

Also export the `Baby` type at the bottom of `server/queries.ts` (client re-declares its own; see Task 10):

```ts
export interface Baby {
  id: number; family: string; name: string; dob: number | null;
  archived_at: number | null; sort_order: number; created_at: number; updated_at: number;
}
```

- [ ] **Step 4: Verify** — `npx vitest run server/queries.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/queries.ts server/queries.test.ts
git commit -m "feat(server): family-scoped baby management queries"
```

## Task 8: `/api/q` + `/api/qtx` dispatch with X-Baby-Id validation

**Files:**
- Modify: `server/store.ts` (generic `transaction<T>(fn)`)
- Modify: `server/app.ts` (replace `/api/exec` `/api/tx` with `/api/q` `/api/qtx`; ctx resolution)
- Test: `server/app.test.ts`

**Interfaces:**
- Consumes: `QUERIES`, `QueryDb`, `QueryCtx` (Tasks 4-7); `familyOf` (Task 1).
- Produces: `POST /api/q { name, args }` → `{ rows }`; `POST /api/qtx { ops: [{name,args}] }` → `{ results }`. 403 on baby-scope with missing/foreign `X-Baby-Id`. `store.transaction<T>(fn: (qdb: QueryDb) => T): T`.

- [ ] **Step 1: Change `store.transaction` to a generic** in `server/store.ts`. Replace the `transaction` method (lines 52-55) and the `Store` interface entry:

Interface (replace line 11):
```ts
  transaction<T>(fn: (qdb: { run(sql: string, params?: unknown[]): Row[] }) => T): T
```

Implementation (replace the `transaction(statements)` method):
```ts
    transaction(fn) {
      const run = db.transaction((f: () => unknown) => f())
      return run(() => fn({ run: (sql: string, params: unknown[] = []) => runOn(db, sql, params) })) as never
    },
```

Update `server/store.test.ts`: the old test used `store.transaction([{sql,...}])`. Replace it with:
```ts
test('transaction runs a function atomically', () => {
  const store = openStore(':memory:')
  store.transaction((qdb) => {
    qdb.run("INSERT INTO settings (scope,key,value) VALUES ('f','a','1')")
    qdb.run("INSERT INTO settings (scope,key,value) VALUES ('f','b','2')")
  })
  expect(store.exec("SELECT COUNT(*) c FROM settings WHERE scope='f'")[0].c).toBe(2)
  store.close()
})
```

- [ ] **Step 2: Write failing dispatch tests** in `server/app.test.ts`. Follow the file's existing harness for building a handler with a store + users + a logged-in cookie. Add:

```ts
// helper assumed from existing tests: `login(handler, 'andres', 'pw')` returns a Cookie header.
// BT_USERS fixture must now use family tags, e.g. 'andres:family=lopez:...'.

test('/api/q runs a named query scoped to the session family', async () => {
  const { handler, store, cookie } = await setupLoggedIn() // existing/renamed helper
  const babyId = Number(store.exec("INSERT INTO babies (family,name,sort_order,created_at,updated_at) VALUES ('lopez','A',0,1,1) RETURNING id")[0].id)
  const res = await post(handler, '/api/q', { name: 'insertEntry', args: { type: 'sleep', start_ts: 5 } },
    { Cookie: cookie, 'X-Baby-Id': String(babyId) })
  expect(res.status).toBe(200)
  expect(store.exec('SELECT baby_id FROM entries')[0].baby_id).toBe(babyId)
})

test('/api/q rejects a baby_id from another family with 403', async () => {
  const { handler, store, cookie } = await setupLoggedIn() // session family = lopez
  const foreign = Number(store.exec("INSERT INTO babies (family,name,sort_order,created_at,updated_at) VALUES ('nunez','X',0,1,1) RETURNING id")[0].id)
  const res = await post(handler, '/api/q', { name: 'listEntries', args: {} }, { Cookie: cookie, 'X-Baby-Id': String(foreign) })
  expect(res.status).toBe(403)
})

test('/api/q on a baby-scoped query with no X-Baby-Id → 400', async () => {
  const { handler, cookie } = await setupLoggedIn()
  const res = await post(handler, '/api/q', { name: 'listEntries', args: {} }, { Cookie: cookie })
  expect(res.status).toBe(400)
})

test('/api/q family-scoped query needs no baby header', async () => {
  const { handler, cookie } = await setupLoggedIn()
  const res = await post(handler, '/api/q', { name: 'listBabies', args: {} }, { Cookie: cookie })
  expect(res.status).toBe(200)
})
```

If `server/app.test.ts` has no `post`/`setupLoggedIn` helpers, add small local helpers mirroring the existing request-simulation style in that file (it already constructs `IncomingMessage`-like objects for login tests — reuse that pattern; pass headers through).

- [ ] **Step 3: Run to verify failure** — `npx vitest run server/app.test.ts`. Expected: FAIL (routes missing).

- [ ] **Step 4: Implement dispatch** in `server/app.ts`. Add imports at top:
```ts
import { QUERIES, type QueryCtx } from './queries.ts'
```
Ensure `familyOf` from Task 1 is present. Replace the `/api/exec` and `/api/tx` blocks (lines 89-98) with:

```ts
        const resolveCtx = (name: string, babyHeader: string | undefined): { ctx?: QueryCtx; error?: [number, string] } => {
          const family = familyOf(req)
          if (!family) return { error: [403, 'No family for user.'] }
          const def = QUERIES[name]
          if (!def) return { error: [404, `Unknown query: ${name}`] }
          if (def.scope === 'family') return { ctx: { family, babyId: -1 } }
          const id = Number(babyHeader)
          if (!babyHeader || !Number.isInteger(id) || id <= 0) return { error: [400, 'Missing X-Baby-Id.'] }
          const owns = store.exec('SELECT 1 FROM babies WHERE id = ? AND family = ?', [id, family])
          if (!owns.length) return { error: [403, 'Baby not in your family.'] }
          return { ctx: { family, babyId: id } }
        }
        const babyHeader = req.headers['x-baby-id'] as string | undefined

        if (url === '/api/q' && method === 'POST') {
          const { name, args } = JSON.parse((await readBody(req)).toString() || '{}')
          if (typeof name !== 'string') return send(res, 400, { error: 'Missing query name.' })
          const { ctx, error } = resolveCtx(name, babyHeader)
          if (error) return send(res, error[0], { error: error[1] })
          const rows = QUERIES[name].run({ run: store.exec }, ctx!, args ?? {})
          return send(res, 200, { rows })
        }
        if (url === '/api/qtx' && method === 'POST') {
          const { ops } = JSON.parse((await readBody(req)).toString() || '{}')
          if (!Array.isArray(ops)) return send(res, 400, { error: 'Missing ops.' })
          // Validate every op's ctx up front; a baby-scoped op fixes the babyId for all.
          const ctxs: QueryCtx[] = []
          for (const op of ops) {
            const { ctx, error } = resolveCtx(op?.name, babyHeader)
            if (error) return send(res, error[0], { error: error[1] })
            ctxs.push(ctx!)
          }
          const results = store.transaction((qdb) =>
            ops.map((op, i) => QUERIES[op.name].run(qdb, ctxs[i], op.args ?? {})))
          return send(res, 200, { results })
        }
```

Leave `/api/export` and `/api/import` as-is for now (scoping addressed in Task 17 docs/decision — default admin-only whole-file).

- [ ] **Step 5: Verify** — `npx vitest run server/app.test.ts` and `npm run build:server`. Expected: PASS + clean build.

- [ ] **Step 6: Commit**

```bash
git add server/app.ts server/store.ts server/app.test.ts server/store.test.ts
git commit -m "feat(server): /api/q + /api/qtx dispatch with X-Baby-Id family enforcement"
```

---

# Milestone 3 — Client: named-query API + query wrappers + test harness

After this milestone the browser talks to `/api/q`, `useDb()` returns the `Api`, all existing components compile unchanged, and the test suite runs against the registry.

## Task 9: `Api` client (`makeApiClient`) with active-baby header

**Files:**
- Create: `src/db/activeBabyRef.ts` (module-level active-baby id)
- Rewrite: `src/db/httpExecutor.ts` → export `makeApiClient` (keep file, add export; keep `UnauthorizedError`/`UNAUTHORIZED_EVENT`)
- Modify: `src/db/client.ts` (`Api` interface, `useDb`)
- Test: `src/db/apiClient.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // activeBabyRef.ts
  export function setActiveBabyId(id: number | null): void
  export function getActiveBabyId(): number | null
  // client.ts
  export interface Api {
    q<T = Row[]>(name: string, args?: unknown): Promise<T>
    tx(ops: { name: string; args?: unknown }[]): Promise<Row[][]>
    exportBytes(): Promise<Uint8Array>
    importBytes(bytes: Uint8Array): Promise<void>
  }
  export function useDb(): Api
  ```

- [ ] **Step 1: Create `src/db/activeBabyRef.ts`:**

```ts
// Module-level mirror of the active baby id so non-React callers (the Api client)
// can stamp the X-Baby-Id header. Kept in sync by ActiveBabyProvider (Task 12).
let activeBabyId: number | null = null
export function setActiveBabyId(id: number | null): void { activeBabyId = id }
export function getActiveBabyId(): number | null { return activeBabyId }
```

- [ ] **Step 2: Write failing test** `src/db/apiClient.test.ts`:

```ts
import { afterEach, expect, test, vi } from 'vitest'
import { makeApiClient } from './httpExecutor'
import { setActiveBabyId } from './activeBabyRef'

afterEach(() => vi.restoreAllMocks())

test('q posts to /api/q with X-Baby-Id header from active baby', async () => {
  setActiveBabyId(42)
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ rows: [{ id: 1 }] }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  const api = makeApiClient()
  const rows = await api.q('insertEntry', { type: 'sleep', start_ts: 1 })
  expect(rows).toEqual([{ id: 1 }])
  const [path, init] = fetchMock.mock.calls[0]
  expect(path).toBe('/api/q')
  expect((init as RequestInit).method).toBe('POST')
  expect(new Headers((init as RequestInit).headers).get('X-Baby-Id')).toBe('42')
  expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: 'insertEntry', args: { type: 'sleep', start_ts: 1 } })
})
```

- [ ] **Step 3: Run to verify failure** — `npx vitest run src/db/apiClient.test.ts`. Expected: FAIL.

- [ ] **Step 4: Rewrite `src/db/httpExecutor.ts`.** Keep `UnauthorizedError`, `UNAUTHORIZED_EVENT`, and the `api()` fetch helper (lines 12-23). **Delete the old top imports** `import type { Row } from './executor'` and `import type { WorkerExecutor } from './client'` (lines 1-2) — they are replaced below. Replace `makeHttpExecutor` (lines 25-64) with:

```ts
import { getActiveBabyId } from './activeBabyRef'
import type { Api } from './client'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function babyHeaders(): Record<string, string> {
  const id = getActiveBabyId()
  return id == null ? { ...JSON_HEADERS } : { ...JSON_HEADERS, 'X-Baby-Id': String(id) }
}

export function makeApiClient(): Api {
  return {
    async q(name, args = {}) {
      const res = await api('/q', { method: 'POST', headers: babyHeaders(), body: JSON.stringify({ name, args }) })
      const { rows } = await res.json()
      return rows
    },
    async tx(ops) {
      const res = await api('/qtx', { method: 'POST', headers: babyHeaders(), body: JSON.stringify({ ops }) })
      const { results } = await res.json()
      return results
    },
    async exportBytes() {
      const res = await api('/export', { method: 'GET' })
      return new Uint8Array(await res.arrayBuffer())
    },
    async importBytes(bytes: Uint8Array) {
      await api('/import', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: new Blob([bytes as unknown as BlobPart]) })
    },
  }
}
```

(The `import type { Row }` line at the top can stay or be removed; keep `Row` import if still referenced.)

- [ ] **Step 5: Update `src/db/client.ts`.** Replace `WorkerExecutor` with `Api`:

```ts
import { createContext, createElement, useContext, useRef, type ReactNode } from 'react'
import type { Row } from './executor'
import { makeApiClient } from './httpExecutor'

export interface Api {
  q<T = Row[]>(name: string, args?: unknown): Promise<T>
  tx(ops: { name: string; args?: unknown }[]): Promise<Row[][]>
  exportBytes(): Promise<Uint8Array>
  importBytes(bytes: Uint8Array): Promise<void>
}

const DbContext = createContext<Api | null>(null)

export function DbProvider({ children, executor }: { children: ReactNode; executor?: Api }) {
  const ref = useRef<Api | null>(null)
  if (!ref.current) ref.current = executor ?? makeApiClient()
  return createElement(DbContext.Provider, { value: ref.current }, children)
}

export function useDb(): Api {
  const db = useContext(DbContext)
  if (!db) throw new Error('useDb must be used within <DbProvider>')
  return db
}
```

- [ ] **Step 6: Verify** — `npx vitest run src/db/apiClient.test.ts`. Expected: PASS. (Build will fail until Task 10 — that's expected; do not run `npm run build` yet.)

- [ ] **Step 7: Commit**

```bash
git add src/db/activeBabyRef.ts src/db/httpExecutor.ts src/db/client.ts src/db/apiClient.test.ts
git commit -m "feat(client): Api client (q/tx) with X-Baby-Id header"
```

## Task 10: Rewrite `queries.ts` as thin `db.q` wrappers

**Files:**
- Rewrite: `src/db/queries.ts`
- Test: covered by Task 11 (registry-backed suite)

**Interfaces:**
- Consumes: `Api` from `client.ts`.
- Produces: same function names/signatures as before, now `(db: Api, ...) => db.q('<name>', args)`. Plus new baby-management wrappers: `listBabies`, `addBaby`, `renameBaby`, `setBabyDob`, `archiveBaby`, `unarchiveBaby`, and a `Baby` type.

- [ ] **Step 1: Rewrite `src/db/queries.ts`.** Keep `NewEntry`/`NewMeasurement` types; drop the `SqlExecutor` import; import `Api` and `Row`:

```ts
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
export async function pauseBreastSide(db: Api, now: number): Promise<void> {
  await db.q('pauseBreastSide', { now })
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
```

- [ ] **Step 2: Add `baby_id` to the `Entry`/`Measurement` types** in `src/db/types.ts`:

In `interface Entry` add after `id: number`: `baby_id: number`.
In `interface Measurement` add after `id: number`: `baby_id: number`.

- [ ] **Step 3: Verify typecheck** — `npx tsc -p tsconfig.json --noEmit`. Fix any call sites that referenced removed exports. Expected: passes except test files still importing `makeTestExecutor` (fixed in Task 11).

- [ ] **Step 4: Commit**

```bash
git add src/db/queries.ts src/db/types.ts
git commit -m "feat(client): queries.ts as thin named-query wrappers + baby management"
```

## Task 11: Registry-backed test harness; migrate existing tests

**Files:**
- Create: `src/db/testApi.ts` (`makeTestApi`)
- Delete: `src/db/testExecutor.ts`, `src/db/testExecutor.test.ts`
- Rewrite: `src/db/queries.test.ts`
- Modify: every test in the Task-11 list to use `makeTestApi`
- Test: the whole suite

**Interfaces:**
- Produces: `makeTestApi(opts?: { family?: string; babyId?: number }): { db: Api; store: BetterSqlite3; babyId: number; family: string }` — an in-memory `Api` backed by `server/queries.ts`, with one baby pre-created so baby-scoped queries work.

- [ ] **Step 1: Create `src/db/testApi.ts`:**

```ts
import Database from 'better-sqlite3'
import { SCHEMA_SQL } from './schema'
import type { Api } from './client'
import type { Row } from './executor'
import { QUERIES, type QueryCtx } from '../../server/queries'

export interface TestApi { db: Api; raw: Database.Database; babyId: number; family: string }

export function makeTestApi(opts: { family?: string } = {}): TestApi {
  const family = opts.family ?? 'testfam'
  const raw = new Database(':memory:')
  raw.exec(SCHEMA_SQL)
  const run = (sql: string, params: unknown[] = []): Row[] => {
    const stmt = raw.prepare(sql)
    if (stmt.reader) return stmt.all(...(params as never[])) as Row[]
    stmt.run(...(params as never[])); return []
  }
  const babyId = Number((run(
    `INSERT INTO babies (family,name,sort_order,created_at,updated_at) VALUES (?, 'Baby', 0, 1, 1) RETURNING id`,
    [family],
  ))[0].id)
  const ctx: QueryCtx = { family, babyId }
  const db: Api = {
    async q(name, args = {}) {
      const def = QUERIES[name]
      if (!def) throw new Error(`Unknown query: ${name}`)
      return def.run({ run }, ctx, args) as never
    },
    async tx(ops) { return ops.map((op) => QUERIES[op.name].run({ run }, ctx, op.args ?? {})) as never },
    async exportBytes() { return raw.serialize() },
    async importBytes() { /* not used in tests */ },
  }
  return { db, raw, babyId, family }
}
```

- [ ] **Step 2: Rewrite `src/db/queries.test.ts`** to drive the client wrappers through `makeTestApi`. Example (port each existing case to this shape):

```ts
import { expect, test } from 'vitest'
import { makeTestApi } from './testApi'
import { insertEntry, listEntries, getActiveTimer, startTimer } from './queries'

test('insertEntry then listEntries roundtrips under the active baby', async () => {
  const { db } = makeTestApi()
  await insertEntry(db, { type: 'sleep', start_ts: 100, end_ts: null, side: null, amount_ml: null, milk_type: null, food: null, diaper_kind: null, med_name: null, med_dose: null, note: null, photo_id: null })
  const rows = await listEntries(db)
  expect(rows).toHaveLength(1)
  expect(rows[0].type).toBe('sleep')
})

test('startTimer / getActiveTimer roundtrip', async () => {
  const { db } = makeTestApi()
  await startTimer(db, { type: 'sleep', start_ts: 5, side: null })
  expect((await getActiveTimer(db))?.type).toBe('sleep')
})
```

(Preserve the intent of the original `queries.test.ts` cases; each now runs against `makeTestApi` and calls the wrapper functions.)

- [ ] **Step 3: Update the other test files.** In each of `src/state/useActiveTimer.test.tsx`, `src/state/useLiveSync.test.tsx`, `src/components/settings/UnitsSection.test.tsx`, `src/components/home/Home.test.tsx`, `src/components/home/BreastSession.test.tsx`, `src/components/home/SleepSession.test.tsx`, `src/components/home/forms/DiaperForm.test.tsx`, `src/components/growth/MeasureForm.test.tsx`, `src/components/history/History.test.tsx`:
  - Replace `import { makeTestExecutor } from '.../db/testExecutor'` → `import { makeTestApi } from '.../db/testApi'`.
  - Replace `const db = await makeTestExecutor()` → `const { db } = makeTestApi()`.
  - Where a test rendered `<DbProvider executor={db}>`, keep it (the prop is now typed `Api` — `db` satisfies it).
  - Any test that seeded rows via raw SQL (`db.exec(...)`) uses `makeTestApi().raw` instead: `const { db, raw } = makeTestApi()` then `raw.prepare(...).run(...)` — but seed with a `baby_id` = the harness `babyId`.

- [ ] **Step 4: Delete obsolete files** — `git rm src/db/testExecutor.ts src/db/testExecutor.test.ts`.

- [ ] **Step 5: Verify** — `npm test`. Work through failures file by file until green. Then `npm run build`. Expected: full suite PASS + client builds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test(client): registry-backed test harness (makeTestApi); migrate suite"
```

---

# Milestone 4 — Client: active-baby context, empty-family gate, live sync

After this milestone the app boots into a family's babies, keeps an active baby, gates empty families, and re-syncs on switch. Still no switcher UI (Task 15) — active baby defaults to the first.

## Task 12: `ActiveBabyContext`

**Files:**
- Create: `src/state/ActiveBabyContext.tsx`
- Test: `src/state/ActiveBabyContext.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface ActiveBaby {
    babies: Baby[]; activeId: number | null; active: Baby | null;
    loading: boolean; setActive(id: number): void; reload(): Promise<void>;
  }
  export function ActiveBabyProvider({ children }: { children: ReactNode }): JSX.Element
  export function useActiveBaby(): ActiveBaby
  ```
- Behavior: on mount, `listBabies(db)`; pick `activeId` from `localStorage['bt.activeBaby']` if it is still in the list, else the first baby; mirror `activeId` into `setActiveBabyId()` (Task 9) and `localStorage`.

- [ ] **Step 1: Write failing test** `src/state/ActiveBabyContext.test.tsx`:

```ts
import { act, render, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import { DbProvider } from '../db/client'
import { makeTestApi } from '../db/testApi'
import { addBaby } from '../db/queries'
import { ActiveBabyProvider, useActiveBaby } from './ActiveBabyContext'
import { getActiveBabyId } from '../db/activeBabyRef'

function Probe() {
  const { active, babies, setActive } = useActiveBaby()
  return (
    <div>
      <span data-testid="active">{active?.name ?? 'none'}</span>
      <span data-testid="count">{babies.length}</span>
      {babies.map((b) => <button key={b.id} onClick={() => setActive(b.id)}>{b.name}</button>)}
    </div>
  )
}

test('loads babies and defaults active to the first; setActive updates ref', async () => {
  const { db, babyId } = makeTestApi() // seeds one baby named 'Baby'
  await addBaby(db, 'Second', null)
  render(<DbProvider executor={db}><ActiveBabyProvider><Probe /></ActiveBabyProvider></DbProvider>)
  await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'))
  expect(screen.getByTestId('active').textContent).toBe('Baby')
  expect(getActiveBabyId()).toBe(babyId)
  await act(async () => { screen.getByText('Second').click() })
  await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('Second'))
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/state/ActiveBabyContext.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement** `src/state/ActiveBabyContext.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useDb } from '../db/client'
import { listBabies, type Baby } from '../db/queries'
import { setActiveBabyId } from '../db/activeBabyRef'

const STORAGE_KEY = 'bt.activeBaby'

export interface ActiveBaby {
  babies: Baby[]
  activeId: number | null
  active: Baby | null
  loading: boolean
  setActive(id: number): void
  reload(): Promise<void>
}

const Ctx = createContext<ActiveBaby | null>(null)

export function ActiveBabyProvider({ children }: { children: ReactNode }) {
  const db = useDb()
  const [babies, setBabies] = useState<Baby[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const apply = useCallback((id: number | null) => {
    setActiveId(id)
    setActiveBabyId(id)
    if (id == null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, String(id))
  }, [])

  const reload = useCallback(async () => {
    const list = await listBabies(db)
    setBabies(list)
    const saved = Number(localStorage.getItem(STORAGE_KEY))
    const keep = list.find((b) => b.id === saved) ?? list[0] ?? null
    apply(keep ? keep.id : null)
    setLoading(false)
  }, [db, apply])

  useEffect(() => { void reload() }, [reload])

  const setActive = useCallback((id: number) => { apply(id) }, [apply])
  const active = babies.find((b) => b.id === activeId) ?? null

  return <Ctx.Provider value={{ babies, activeId, active, loading, setActive, reload }}>{children}</Ctx.Provider>
}

export function useActiveBaby(): ActiveBaby {
  const v = useContext(Ctx)
  if (!v) throw new Error('useActiveBaby must be used within <ActiveBabyProvider>')
  return v
}
```

- [ ] **Step 4: Verify** — `npx vitest run src/state/ActiveBabyContext.test.tsx`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/ActiveBabyContext.tsx src/state/ActiveBabyContext.test.tsx
git commit -m "feat(client): ActiveBabyContext (load, persist, switch)"
```

## Task 13: Empty-family gate + first-baby screen; wire providers

**Files:**
- Create: `src/components/babies/FirstBabyScreen.tsx`
- Modify: `src/main.tsx` (wrap `App` in `ActiveBabyProvider`), `src/App.tsx` (gate on active baby)
- Test: `src/components/babies/FirstBabyScreen.test.tsx`

**Interfaces:**
- Consumes: `useActiveBaby`, `addBaby`.
- Produces: `FirstBabyScreen` — a form that calls `addBaby(db, name, dob)` then `reload()`.

- [ ] **Step 1: Write failing test** `src/components/babies/FirstBabyScreen.test.tsx`:

```ts
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { expect, test } from 'vitest'
import { DbProvider } from '../../db/client'
import { makeTestApi } from '../../db/testApi'
import { archiveBaby } from '../../db/queries'
import { ActiveBabyProvider, useActiveBaby } from '../../state/ActiveBabyContext'
import { FirstBabyScreen } from './FirstBabyScreen'

function Harness() {
  const { active, loading } = useActiveBaby()
  if (loading) return <span>loading</span>
  return active ? <span data-testid="has">{active.name}</span> : <FirstBabyScreen />
}

test('adding the first baby dismisses the gate', async () => {
  const { db, babyId } = makeTestApi()
  await archiveBaby(db, babyId) // now the family has zero non-archived babies
  render(<DbProvider executor={db}><ActiveBabyProvider><Harness /></ActiveBabyProvider></DbProvider>)
  await waitFor(() => expect(screen.getByPlaceholderText(/name/i)).toBeInTheDocument())
  fireEvent.change(screen.getByPlaceholderText(/name/i), { target: { value: 'Nova' } })
  fireEvent.click(screen.getByRole('button', { name: /add baby/i }))
  await waitFor(() => expect(screen.getByTestId('has').textContent).toBe('Nova'))
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/components/babies/FirstBabyScreen.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement `FirstBabyScreen.tsx`:**

```tsx
import { useState } from 'react'
import { useDb } from '../../db/client'
import { addBaby } from '../../db/queries'
import { useActiveBaby } from '../../state/ActiveBabyContext'

export function FirstBabyScreen() {
  const db = useDb()
  const { reload } = useActiveBaby()
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    await addBaby(db, name.trim(), dob ? new Date(dob).getTime() : null)
    await reload()
  }

  return (
    <div className="first-baby">
      <h2>Add your first baby</h2>
      <input className="text-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="timefield"><span>Date of birth</span>
        <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></label>
      <button className="primary-btn" disabled={!name.trim() || busy} onClick={() => void submit()}>Add baby</button>
    </div>
  )
}
```

- [ ] **Step 4: Wire providers.** In `src/main.tsx`, wrap `App` (replace lines 14-18):

```tsx
  return (
    <DbProvider>
      <ActiveBabyProvider>
        <App />
      </ActiveBabyProvider>
    </DbProvider>
  )
```
Add import: `import { ActiveBabyProvider } from './state/ActiveBabyContext'`.

In `src/App.tsx`, gate on active baby at the top of the component body (after hooks that must run unconditionally — move `useActiveBaby` above `useLiveSync`; keep hook order stable by early-returning before JSX only, not before other hooks). Simplest: add near the top of `App()`:

```tsx
  const { active, loading: babyLoading } = useActiveBaby()
```
and after the existing hooks, before the main `return`:
```tsx
  if (babyLoading) return <div className="app" />
  if (!active) return <div className="app"><FirstBabyScreen /></div>
```
Add imports for `useActiveBaby` and `FirstBabyScreen`. (Ensure all `useState`/`useLiveSync` hooks are declared before these early returns to preserve hook order.)

- [ ] **Step 5: Verify** — `npx vitest run src/components/babies/FirstBabyScreen.test.tsx` and `npm run build`. Expected: PASS + build clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/babies/FirstBabyScreen.tsx src/components/babies/FirstBabyScreen.test.tsx src/main.tsx src/App.tsx
git commit -m "feat(client): empty-family gate + first-baby screen; wire ActiveBabyProvider"
```

## Task 14: Re-sync live data on baby switch

**Files:**
- Modify: `src/App.tsx` (bump `refreshKey` when active baby changes)
- Test: covered by manual verify + existing `useLiveSync` tests (baseline reset already handled by remount)

**Interfaces:**
- Consumes: `useActiveBaby().activeId`.

- [ ] **Step 1: Add an effect in `App.tsx`** so switching the baby forces a data refresh and resets `useLiveSync`'s baseline. Extend the existing `useActiveBaby()` destructure added in Task 13 to also pull `activeId`:

```tsx
  const { active, loading: babyLoading, activeId } = useActiveBaby()
```
Then, after the `useLiveSync(...)` line, add:

```tsx
  useEffect(() => { setRefreshKey((k) => k + 1) }, [activeId])
```
Add `useEffect` to the React import (`import { useState, useEffect } from 'react'`). (Because `Home`/`History` are keyed by `refreshKey`, they remount and re-query under the new `X-Baby-Id`; `useLiveSync` is keyed to the `App` instance and re-baselines on the next poll since the marker query is now per-baby.)

- [ ] **Step 2: Verify** — `npm run build` and `npm test`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(client): refresh data when the active baby changes"
```

---

# Milestone 5 — UI: baby switcher, manage babies, docs

## Task 15: Baby switcher drawer

**Files:**
- Create: `src/components/babies/BabySwitcher.tsx`
- Modify: `src/App.tsx` (header trigger + drawer), `src/styles/theme.css` (drawer styles)
- Test: `src/components/babies/BabySwitcher.test.tsx`

**Interfaces:**
- Consumes: `useActiveBaby`.
- Produces: `BabySwitcher({ open, onClose, onManage })` — a slide-in panel listing non-archived babies; tapping one calls `setActive` + `onClose`.

- [ ] **Step 1: Write failing test** `src/components/babies/BabySwitcher.test.tsx`:

```ts
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { DbProvider } from '../../db/client'
import { makeTestApi } from '../../db/testApi'
import { addBaby } from '../../db/queries'
import { ActiveBabyProvider, useActiveBaby } from '../../state/ActiveBabyContext'
import { BabySwitcher } from './BabySwitcher'

function Wrap() {
  const { active } = useActiveBaby()
  return <><span data-testid="active">{active?.name}</span>
    <BabySwitcher open onClose={() => {}} onManage={() => {}} /></>
}

test('tapping a baby switches the active baby', async () => {
  const { db } = makeTestApi()
  await addBaby(db, 'Zoe', null)
  render(<DbProvider executor={db}><ActiveBabyProvider><Wrap /></ActiveBabyProvider></DbProvider>)
  await waitFor(() => screen.getByText('Zoe'))
  fireEvent.click(screen.getByText('Zoe'))
  await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('Zoe'))
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/components/babies/BabySwitcher.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement `BabySwitcher.tsx`:**

```tsx
import { useActiveBaby } from '../../state/ActiveBabyContext'

export function BabySwitcher({ open, onClose, onManage }: { open: boolean; onClose(): void; onManage(): void }) {
  const { babies, activeId, setActive } = useActiveBaby()
  if (!open) return null
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="baby-drawer" onClick={(e) => e.stopPropagation()}>
        <h3>Babies</h3>
        <ul className="baby-list">
          {babies.map((b) => (
            <li key={b.id}>
              <button
                className={b.id === activeId ? 'baby-item active' : 'baby-item'}
                onClick={() => { setActive(b.id); onClose() }}
              >{b.name}</button>
            </li>
          ))}
        </ul>
        <button className="link-btn" onClick={onManage}>Manage babies</button>
      </aside>
    </div>
  )
}
```

- [ ] **Step 4: Wire into `App.tsx`.** Add state `const [switcherOpen, setSwitcherOpen] = useState(false)` and `const [tab...]`. Make the masthead show the active baby and open the drawer. Replace the `<header className="masthead">` block:

```tsx
      <header className="masthead">
        <button className="mast-baby" onClick={() => setSwitcherOpen(true)}>
          {active?.name ?? 'BABYLOG'} <span aria-hidden>▾</span>
        </button>
        <span className="mast-date">{today}</span>
      </header>
```
Render the drawer near the other sheets (before `</div>`):
```tsx
      <BabySwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} onManage={() => { setSwitcherOpen(false); setTab('settings') }} />
```
Add imports for `BabySwitcher`.

- [ ] **Step 5: Add drawer styles** to `src/styles/theme.css` (match the existing neobrutalist tokens — reuse existing `--border`, surface, and shadow variables that appear elsewhere in the file):

```css
.drawer-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 50; }
.baby-drawer { position: absolute; top: 0; left: 0; height: 100%; width: min(80vw, 320px);
  background: var(--surface, #1b1b1f); border-right: 3px solid var(--border, #000);
  padding: 20px; display: flex; flex-direction: column; gap: 12px; }
.baby-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.baby-item { width: 100%; text-align: left; padding: 12px 14px; border: 3px solid var(--border, #000);
  background: var(--surface-2, #26262b); color: inherit; font-weight: 700; border-radius: 10px; }
.baby-item.active { background: var(--accent, #b8f24a); color: #000; }
.mast-baby { background: none; border: none; color: inherit; font: inherit; font-weight: 800; letter-spacing: .04em; }
```

- [ ] **Step 6: Verify** — `npx vitest run src/components/babies/BabySwitcher.test.tsx` and `npm run build`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/babies/BabySwitcher.tsx src/App.tsx src/styles/theme.css src/components/babies/BabySwitcher.test.tsx
git commit -m "feat(client): baby switcher drawer in the masthead"
```

## Task 16: Manage-babies UI (replace ProfileSection)

**Files:**
- Create: `src/components/settings/BabiesSection.tsx`
- Delete: `src/components/settings/ProfileSection.tsx`
- Modify: `src/components/settings/Settings.tsx` (swap section)
- Test: `src/components/settings/BabiesSection.test.tsx`

**Interfaces:**
- Consumes: `useActiveBaby`, `addBaby`, `renameBaby`, `setBabyDob`, `archiveBaby`, `unarchiveBaby`, `listBabies`.
- Produces: `BabiesSection` — list current babies with rename/DOB/archive; add a new baby; toggle "show archived" to reveal + un-archive.

- [ ] **Step 1: Write failing test** `src/components/settings/BabiesSection.test.tsx`:

```ts
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import { DbProvider } from '../../db/client'
import { makeTestApi } from '../../db/testApi'
import { ActiveBabyProvider } from '../../state/ActiveBabyContext'
import { BabiesSection } from './BabiesSection'

function mount(db: any) {
  return render(<DbProvider executor={db}><ActiveBabyProvider><BabiesSection /></ActiveBabyProvider></DbProvider>)
}

test('can add a baby', async () => {
  const { db } = makeTestApi()
  mount(db)
  await waitFor(() => screen.getByText('Baby'))
  fireEvent.change(screen.getByPlaceholderText(/new baby/i), { target: { value: 'Ivy' } })
  fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
  await waitFor(() => expect(screen.getByDisplayValue('Ivy')).toBeInTheDocument())
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/components/settings/BabiesSection.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement `BabiesSection.tsx`:**

```tsx
import { useState } from 'react'
import { useDb } from '../../db/client'
import { addBaby, renameBaby, setBabyDob, archiveBaby, unarchiveBaby, listBabies, type Baby } from '../../db/queries'
import { useActiveBaby } from '../../state/ActiveBabyContext'
import { ageLabel } from '../../lib/time'

function dateInput(dob: number | null): string {
  return dob ? new Date(dob).toISOString().slice(0, 10) : ''
}

export function BabiesSection() {
  const db = useDb()
  const { babies, reload } = useActiveBaby()
  const [archived, setArchived] = useState<Baby[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [newName, setNewName] = useState('')

  const refreshArchived = async () => setArchived((await listBabies(db, true)).filter((b) => b.archived_at))

  const add = async () => {
    if (!newName.trim()) return
    await addBaby(db, newName.trim(), null)
    setNewName(''); await reload()
  }

  return (
    <section className="card-section">
      <h3>Babies</h3>
      {babies.map((b) => (
        <div key={b.id} className="baby-row">
          <input className="text-input" defaultValue={b.name}
            onBlur={(e) => { void renameBaby(db, b.id, e.target.value).then(reload) }} />
          <label className="timefield"><span>DOB</span>
            <input type="date" defaultValue={dateInput(b.dob)}
              onChange={(e) => { void setBabyDob(db, b.id, e.target.value ? new Date(e.target.value).getTime() : null).then(reload) }} /></label>
          {b.dob && <p className="muted">Age: {ageLabel(b.dob, Date.now())}</p>}
          <button className="link-btn" onClick={() => { void archiveBaby(db, b.id).then(reload) }}>Archive</button>
        </div>
      ))}
      <div className="baby-add">
        <input className="text-input" placeholder="New baby name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="primary-btn" onClick={() => void add()}>Add</button>
      </div>
      <button className="link-btn" onClick={() => { setShowArchived((v) => !v); if (!showArchived) void refreshArchived() }}>
        {showArchived ? 'Hide archived' : 'Show archived'}
      </button>
      {showArchived && archived.map((b) => (
        <div key={b.id} className="baby-row muted">
          <span>{b.name}</span>
          <button className="link-btn" onClick={() => { void unarchiveBaby(db, b.id).then(() => { void reload(); void refreshArchived() }) }}>Un-archive</button>
        </div>
      ))}
    </section>
  )
}
```

- [ ] **Step 4: Swap the section** in `src/components/settings/Settings.tsx`: replace the `ProfileSection` import and usage with `BabiesSection`. Then `git rm src/components/settings/ProfileSection.tsx`.

- [ ] **Step 5: Verify** — `npx vitest run src/components/settings/BabiesSection.test.tsx` and `npm run build`. Expected: PASS. Also run `npm test` to confirm no test still imports `ProfileSection`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(client): manage-babies settings section; remove single-baby ProfileSection"
```

## Task 17: Docs, env examples, and final verification

**Files:**
- Modify: `README.md`, `deploy/.env.example`, `scripts/hash-password.mjs` (output hint), `server/app.ts` (export/import note)
- Test: full suite + manual smoke

**Interfaces:** none (docs + verification).

- [ ] **Step 1: Update `scripts/hash-password.mjs`** so it prints the family-tagged line. Find where it prints `name:scrypt$...` and change the printed template to `name:family=FAMILY:scrypt$...`, printing a reminder to replace `FAMILY`. (Read the script; adjust the final `console.log`.)

- [ ] **Step 2: Update `deploy/.env.example`** — change the `BT_USERS=` example to the family-tagged format and add a commented `LEGACY_FAMILY=` line:

```
# BT_USERS: comma-separated  name:family=KEY:scrypt$salt$hash
BT_USERS=andres:family=lopez:scrypt$...,maria:family=lopez:scrypt$...,otherparent:family=nunez:scrypt$...
# Which family existing (pre-families) data migrates onto. Defaults to the first family in BT_USERS.
# LEGACY_FAMILY=lopez
```

- [ ] **Step 3: Update `README.md`** — replace the "one baby" framing: describe families, multiple babies, the sidebar switcher, and server-enforced isolation. Update the "Login" bullet to the family-tagged `BT_USERS` format. Add a short "Backup scope" note (see Step 4).

- [ ] **Step 4: Decide and document export/import scope.** For v1, keep whole-file export/import but restrict it to an **admin family** via an optional `ADMIN_FAMILY` env: in `server/app.ts`, guard `/api/export` and `/api/import` with `if (familyOf(req) !== adminFamily) return send(res, 403, ...)` when `ADMIN_FAMILY` is set (thread `adminFamily` through `AppConfig` from `index.ts` reading `process.env.ADMIN_FAMILY`). If `ADMIN_FAMILY` is unset, keep current behavior but document the risk in README. Add a test in `server/app.test.ts`:

```ts
test('export is blocked for non-admin family when ADMIN_FAMILY set', async () => {
  const { handler, cookie } = await setupLoggedIn({ adminFamily: 'nunez' }) // session family lopez
  const res = await get(handler, '/api/export', { Cookie: cookie })
  expect(res.status).toBe(403)
})
```

- [ ] **Step 5: Full verification.**

Run: `npm test`
Expected: all green.

Run: `npm run build && npm run build:server`
Expected: both succeed.

Manual smoke (document result in the commit): create a local `.env` with two families (use `npm run hash-password`), `npm run dev`, then:
  1. Sign in as family A → existing data appears under the migrated baby.
  2. Settings → Babies → add a second baby; switch via the masthead drawer; confirm Home/History/Growth reflect the switch.
  3. Sign in as family B (separate browser/incognito) → empty → add first baby → log an entry.
  4. Confirm family B cannot see family A's data (and vice versa).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: families/multi-baby README, env examples, admin-scoped backup; final verification"
```

---

## Self-Review notes (author)

- **Spec coverage:** data model (Tasks 2-3, 7, 10), auth family tags (Task 1), enforcement/named-query RPC + X-Baby-Id 403 (Tasks 4-9), migration (Task 3), sidebar switcher (Task 15), manage babies incl. archived (Task 16), empty-family gate (Task 13), per-baby live sync (Tasks 6+14), testing (throughout), backup scope risk (Task 17), per-baby timer note (banner shows active baby only — inherent to Task 6's per-baby `getActiveTimer`). All spec sections map to tasks.
- **`breast_last_side`** refined to per-baby (`settings` scope `baby:<id>`) — a small improvement over the spec's family-level settings, noted here.
- **Backup/export** defaults to admin-family gating (spec's option a) via optional `ADMIN_FAMILY`.
- **Hook-order caution** flagged in Task 13 (declare all hooks before the empty-family early return).

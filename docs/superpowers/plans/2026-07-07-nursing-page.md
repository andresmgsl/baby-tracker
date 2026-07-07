# Nursing (Breast) Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the small breast-form sheet with a full-screen per-side "NURSING" page (L/R timers, Last badge, total feed duration) and make tapping a running timer banner open its page instead of stopping it.

**Architecture:** Add per-side accumulator columns to `active_timer` (live) and `entries` (persisted), driven by two new queries (`startBreastSide` / `pauseBreastSide`) plus a pure math helper. A new `BreastSession.tsx` mirrors `SleepSession.tsx`. Wiring routes the breast quick-log button and the breast timer banner to the new page; `BreastForm.tsx` is deleted.

**Tech Stack:** React + TypeScript, Vite, Vitest, better-sqlite3 (server + in-memory test executor), a thin SqlExecutor abstraction.

## Global Constraints

- One side runs at a time. Starting/switching a side commits the other side's elapsed run into its accumulator; tapping the running side pauses it.
- A saved breast entry: `end_ts = start_ts + left_ms + right_ms`; `side` = `'L'` (only left), `'R'` (only right), `'both'` (both `> 0`); default `'L'` when both are 0.
- Migrations are idempotent `ALTER TABLE ... ADD COLUMN` guarded by `PRAGMA table_info`, matching the existing `ensureActiveTimerColumns` pattern in `server/store.ts`. New columns also go into `SCHEMA_SQL` for fresh DBs.
- `active_timer` new columns: `left_ms INTEGER NOT NULL DEFAULT 0`, `right_ms INTEGER NOT NULL DEFAULT 0`, `running_since INTEGER`. `entries` new columns: `left_ms INTEGER`, `right_ms INTEGER` (nullable).
- Setting key `breast_last_side` holds `'L'` or `'R'`, written whenever a side starts.
- Only one timer type is active at a time; `getActiveTimer` returns the single row (LIMIT 1). Sleep keeps using `paused_ms`/`paused_at`; breast keeps those at 0/null.
- Run all tests with `npm test -- --run`. Typecheck with `npm run build` (or the project's `tsc` script) when a task changes shared types.

---

## File Structure

- `src/db/schema.ts` — add per-side columns to `entries` and `active_timer` CREATE statements. (modify)
- `server/store.ts` — add `ensureEntriesColumns`; extend `ensureActiveTimerColumns`. (modify)
- `server/store.test.ts` — migration tests for the new columns. (modify)
- `src/db/types.ts` — extend `Entry` and `ActiveTimer`. (modify)
- `src/db/queries.ts` — extend `NewEntry`, `insertEntry`, `getActiveTimer`, `startTimer`; add `startBreastSide`, `pauseBreastSide`. (modify)
- `src/db/queries.test.ts` — tests for the two new queries + insert round-trip. (modify)
- `src/lib/breast.ts` — pure helpers `breastTotals`, `deriveSide`. (create)
- `src/lib/breast.test.ts` — helper tests. (create)
- `src/components/home/entryLabel.ts` — per-side breast label. (modify)
- `src/components/home/entryLabel.test.ts` — label tests. (modify)
- `src/components/home/BreastSession.tsx` — the new page. (create)
- `src/components/home/BreastSession.test.tsx` — component tests. (create)
- `src/styles/theme.css` — `.breast-page` styles. (modify)
- `src/App.tsx` — mount `BreastSession`, add `onOpenBreast`. (modify)
- `src/components/home/Home.tsx` — route breast to the page; remove `stopTimer`. (modify)
- `src/components/home/TimerBanner.tsx` — "Tap to open" copy. (modify)
- `src/components/home/LogSheet.tsx` — drop breast from the sheet map. (modify)
- `src/components/home/forms/BreastForm.tsx` — delete. (delete)

---

## Task 1: Per-side schema, migrations, and types

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `server/store.ts`
- Modify: `server/store.test.ts`
- Modify: `src/db/types.ts`
- Modify: `src/db/queries.ts` (`NewEntry`, `insertEntry`, `getActiveTimer`, `startTimer`)
- Test: `server/store.test.ts`

**Interfaces:**
- Produces:
  - `Entry` gains `left_ms: number | null`, `right_ms: number | null`.
  - `ActiveTimer` gains `left_ms: number`, `right_ms: number`, `running_since: number | null`.
  - `NewEntry` treats `left_ms` / `right_ms` as optional (`number | null | undefined`); `insertEntry` writes them defaulting to `null`.
  - `getActiveTimer` returns the three new `ActiveTimer` fields.

- [ ] **Step 1: Write the failing migration tests**

Add to `server/store.test.ts` inside the existing `describe('openStore migration', ...)`:

```ts
it('adds per-side columns to a pre-existing active_timer table and preserves rows', () => {
  const path = tempPath()
  const old = new Database(path)
  old.exec(`CREATE TABLE active_timer (type TEXT PRIMARY KEY, start_ts INTEGER NOT NULL, side TEXT)`)
  old.prepare('INSERT INTO active_timer (type, start_ts, side) VALUES (?, ?, ?)').run('breast', 1000, 'L')
  old.close()

  const store = openStore(path)
  const cols = store.exec('PRAGMA table_info(active_timer)').map((c) => c.name)
  expect(cols).toContain('left_ms')
  expect(cols).toContain('right_ms')
  expect(cols).toContain('running_since')

  const [row] = store.exec('SELECT * FROM active_timer')
  expect(row.start_ts).toBe(1000)
  expect(row.left_ms).toBe(0)
  expect(row.right_ms).toBe(0)
  expect(row.running_since).toBeNull()
  store.close()
})

it('adds per-side columns to a pre-existing entries table and preserves rows', () => {
  const path = tempPath()
  const old = new Database(path)
  old.exec(`CREATE TABLE entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, start_ts INTEGER NOT NULL,
    end_ts INTEGER, side TEXT, amount_ml REAL, milk_type TEXT, food TEXT, diaper_kind TEXT,
    med_name TEXT, med_dose TEXT, note TEXT, photo_id INTEGER,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
  old.prepare(`INSERT INTO entries (type, start_ts, side, created_at, updated_at)
    VALUES ('breast', 2000, 'both', 1, 1)`).run()
  old.close()

  const store = openStore(path)
  const cols = store.exec('PRAGMA table_info(entries)').map((c) => c.name)
  expect(cols).toContain('left_ms')
  expect(cols).toContain('right_ms')
  const [row] = store.exec('SELECT * FROM entries')
  expect(row.start_ts).toBe(2000)
  expect(row.left_ms).toBeNull()
  expect(row.right_ms).toBeNull()
  store.close()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run server/store.test.ts`
Expected: FAIL — new columns missing (`toContain('left_ms')` fails).

- [ ] **Step 3: Add the columns to `SCHEMA_SQL`**

In `src/db/schema.ts`, extend the `entries` CREATE (add after `photo_id INTEGER,`):

```sql
  left_ms INTEGER,
  right_ms INTEGER,
```

And extend the `active_timer` CREATE (add after `paused_at INTEGER`):

```sql
  ,
  left_ms INTEGER NOT NULL DEFAULT 0,
  right_ms INTEGER NOT NULL DEFAULT 0,
  running_since INTEGER
```

(Ensure the resulting column list is comma-correct: `paused_at INTEGER,` then the three new lines without a trailing comma before `)`.)

- [ ] **Step 4: Add the migration guards in `server/store.ts`**

Extend `ensureActiveTimerColumns` (add before its closing brace):

```ts
  if (!names.has('left_ms')) db.exec('ALTER TABLE active_timer ADD COLUMN left_ms INTEGER NOT NULL DEFAULT 0')
  if (!names.has('right_ms')) db.exec('ALTER TABLE active_timer ADD COLUMN right_ms INTEGER NOT NULL DEFAULT 0')
  if (!names.has('running_since')) db.exec('ALTER TABLE active_timer ADD COLUMN running_since INTEGER')
```

Add a new function:

```ts
function ensureEntriesColumns(db: Database.Database): void {
  const names = new Set(
    (db.prepare('PRAGMA table_info(entries)').all() as { name: string }[]).map((c) => c.name),
  )
  if (!names.has('left_ms')) db.exec('ALTER TABLE entries ADD COLUMN left_ms INTEGER')
  if (!names.has('right_ms')) db.exec('ALTER TABLE entries ADD COLUMN right_ms INTEGER')
}
```

Call it in both places `ensureActiveTimerColumns(db)` is called (in `openStore` after `db.exec(SCHEMA_SQL)`, and inside `replace` after `db.exec(SCHEMA_SQL)`):

```ts
  ensureActiveTimerColumns(db)
  ensureEntriesColumns(db)
```

- [ ] **Step 5: Run the migration tests to verify they pass**

Run: `npm test -- --run server/store.test.ts`
Expected: PASS (all migration tests, including the pre-existing pause-column ones).

- [ ] **Step 6: Extend the TypeScript types**

In `src/db/types.ts`, add to `Entry` (after `photo_id`):

```ts
  left_ms: number | null
  right_ms: number | null
```

And to `ActiveTimer` (after `paused_at`):

```ts
  left_ms: number
  right_ms: number
  running_since: number | null
```

- [ ] **Step 7: Update `NewEntry`, `insertEntry`, `getActiveTimer`, `startTimer`**

In `src/db/queries.ts`:

Make the new entry columns optional so existing callers still compile:

```ts
export type NewEntry =
  Omit<Entry, 'id' | 'created_at' | 'updated_at' | 'left_ms' | 'right_ms'>
  & { left_ms?: number | null; right_ms?: number | null }
```

Add the columns to `ENTRY_COLS`:

```ts
const ENTRY_COLS = [
  'type', 'start_ts', 'end_ts', 'side', 'amount_ml', 'milk_type', 'food',
  'diaper_kind', 'med_name', 'med_dose', 'note', 'photo_id', 'left_ms', 'right_ms',
] as const
```

In `insertEntry`, default missing values to null:

```ts
  const values = [...ENTRY_COLS.map((c) => data[c] ?? null), ts, ts]
```

In `getActiveTimer`, return the new fields:

```ts
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
```

In `startTimer` (sleep path), reset the new columns on insert/conflict:

```ts
  await exec.exec(
    `INSERT INTO active_timer (type, start_ts, side, paused_ms, paused_at, left_ms, right_ms, running_since)
     VALUES (?, ?, ?, 0, NULL, 0, 0, NULL)
     ON CONFLICT(type) DO UPDATE SET start_ts = excluded.start_ts, side = excluded.side,
       paused_ms = 0, paused_at = NULL, left_ms = 0, right_ms = 0, running_since = NULL`,
    [t.type, t.start_ts, t.side],
  )
```

- [ ] **Step 8: Run the full test suite (nothing should break)**

Run: `npm test -- --run`
Expected: PASS. (`insertEntry` callers still compile because `left_ms`/`right_ms` are optional.)

- [ ] **Step 9: Commit**

```bash
git add src/db/schema.ts server/store.ts server/store.test.ts src/db/types.ts src/db/queries.ts
git commit -m "feat: per-side left_ms/right_ms columns on entries + active_timer"
```

---

## Task 2: Breast math helper + per-side queries

**Files:**
- Create: `src/lib/breast.ts`
- Create: `src/lib/breast.test.ts`
- Modify: `src/db/queries.ts` (add `startBreastSide`, `pauseBreastSide`)
- Test: `src/db/queries.test.ts`

**Interfaces:**
- Consumes: `ActiveTimer` fields from Task 1; `setSetting` from `queries.ts`.
- Produces:
  - `breastTotals(t: Pick<ActiveTimer, 'side' | 'left_ms' | 'right_ms' | 'running_since'>, now: number): { left: number; right: number; total: number }`
  - `deriveSide(left_ms: number, right_ms: number): Side`
  - `startBreastSide(exec: SqlExecutor, side: 'L' | 'R', now: number): Promise<void>`
  - `pauseBreastSide(exec: SqlExecutor, now: number): Promise<void>`

- [ ] **Step 1: Write the failing helper tests**

Create `src/lib/breast.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { breastTotals, deriveSide } from './breast'

const base = { side: null, left_ms: 0, right_ms: 0, running_since: null } as const

describe('breastTotals', () => {
  it('is zero when idle', () => {
    expect(breastTotals(base, 5000)).toEqual({ left: 0, right: 0, total: 0 })
  })
  it('adds the running-left segment to committed left', () => {
    const t = { ...base, side: 'L' as const, left_ms: 2000, running_since: 4000 }
    expect(breastTotals(t, 9000)).toEqual({ left: 7000, right: 0, total: 7000 })
  })
  it('adds the running-right segment and keeps committed left', () => {
    const t = { ...base, side: 'R' as const, left_ms: 3000, right_ms: 1000, running_since: 4000 }
    expect(breastTotals(t, 6000)).toEqual({ left: 3000, right: 3000, total: 6000 })
  })
  it('ignores a running segment when paused (running_since null)', () => {
    const t = { ...base, left_ms: 3000, right_ms: 2000 }
    expect(breastTotals(t, 999999)).toEqual({ left: 3000, right: 2000, total: 5000 })
  })
})

describe('deriveSide', () => {
  it('is both when both sides have time', () => { expect(deriveSide(1, 1)).toBe('both') })
  it('is R when only right has time', () => { expect(deriveSide(0, 5)).toBe('R') })
  it('is L when only left has time', () => { expect(deriveSide(5, 0)).toBe('L') })
  it('defaults to L when neither has time', () => { expect(deriveSide(0, 0)).toBe('L') })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --run src/lib/breast.test.ts`
Expected: FAIL — `./breast` module not found.

- [ ] **Step 3: Implement the helper**

Create `src/lib/breast.ts`:

```ts
import type { ActiveTimer, Side } from '../db/types'

export interface BreastTotals { left: number; right: number; total: number }

export function breastTotals(
  t: Pick<ActiveTimer, 'side' | 'left_ms' | 'right_ms' | 'running_since'>,
  now: number,
): BreastTotals {
  const runL = t.side === 'L' && t.running_since != null ? Math.max(0, now - t.running_since) : 0
  const runR = t.side === 'R' && t.running_since != null ? Math.max(0, now - t.running_since) : 0
  const left = t.left_ms + runL
  const right = t.right_ms + runR
  return { left, right, total: left + right }
}

export function deriveSide(left_ms: number, right_ms: number): Side {
  if (left_ms > 0 && right_ms > 0) return 'both'
  return right_ms > 0 ? 'R' : 'L'
}
```

- [ ] **Step 4: Run to verify the helper passes**

Run: `npm test -- --run src/lib/breast.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing query tests**

Add to `src/db/queries.test.ts` (imports: add `startBreastSide`, `pauseBreastSide`, `getActiveTimer`, `getSetting` to the existing `../db/queries` import; if the test file uses `makeTestExecutor`, follow the file's existing setup pattern):

```ts
describe('breast per-side timer', () => {
  it('starts a side: inserts a running breast row and records last side', async () => {
    const db = await makeTestExecutor()
    await startBreastSide(db, 'L', 1000)
    const t = (await getActiveTimer(db))!
    expect(t.type).toBe('breast')
    expect(t.start_ts).toBe(1000)
    expect(t.side).toBe('L')
    expect(t.running_since).toBe(1000)
    expect(t.left_ms).toBe(0)
    expect(await getSetting(db, 'breast_last_side')).toBe('L')
  })

  it('switching sides commits the running side into its accumulator', async () => {
    const db = await makeTestExecutor()
    await startBreastSide(db, 'L', 1000)
    await startBreastSide(db, 'R', 6000) // L ran 5000ms
    const t = (await getActiveTimer(db))!
    expect(t.left_ms).toBe(5000)
    expect(t.side).toBe('R')
    expect(t.running_since).toBe(6000)
    expect(t.start_ts).toBe(1000) // session start unchanged
    expect(await getSetting(db, 'breast_last_side')).toBe('R')
  })

  it('pausing commits the running side and clears running state', async () => {
    const db = await makeTestExecutor()
    await startBreastSide(db, 'R', 1000)
    await pauseBreastSide(db, 4000) // R ran 3000ms
    const t = (await getActiveTimer(db))!
    expect(t.right_ms).toBe(3000)
    expect(t.side).toBeNull()
    expect(t.running_since).toBeNull()
  })

  it('pause is a no-op when nothing is running', async () => {
    const db = await makeTestExecutor()
    await startBreastSide(db, 'L', 1000)
    await pauseBreastSide(db, 4000) // L -> 3000
    await pauseBreastSide(db, 9000) // no side running; no change
    const t = (await getActiveTimer(db))!
    expect(t.left_ms).toBe(3000)
  })

  it('resuming after pause starts the tapped side without a new row', async () => {
    const db = await makeTestExecutor()
    await startBreastSide(db, 'L', 1000)
    await pauseBreastSide(db, 4000)   // left_ms = 3000
    await startBreastSide(db, 'L', 5000) // resume L
    const t = (await getActiveTimer(db))!
    expect(t.left_ms).toBe(3000)
    expect(t.side).toBe('L')
    expect(t.running_since).toBe(5000)
  })
})
```

- [ ] **Step 6: Run to verify failure**

Run: `npm test -- --run src/db/queries.test.ts`
Expected: FAIL — `startBreastSide`/`pauseBreastSide` not exported.

- [ ] **Step 7: Implement the queries**

Add to `src/db/queries.ts` (after `resumeTimer`):

```ts
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
```

Note: `col` is chosen from the fixed literals `'left_ms'`/`'right_ms'`, so the interpolation is not user-controlled.

- [ ] **Step 8: Run to verify the queries pass**

Run: `npm test -- --run src/db/queries.test.ts src/lib/breast.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/breast.ts src/lib/breast.test.ts src/db/queries.ts src/db/queries.test.ts
git commit -m "feat: breast per-side timer queries and totals helper"
```

---

## Task 3: Per-side breast label in the timeline

**Files:**
- Modify: `src/components/home/entryLabel.ts`
- Test: `src/components/home/entryLabel.test.ts`

**Interfaces:**
- Consumes: `Entry.left_ms` / `Entry.right_ms` from Task 1; `formatDuration` from `src/lib/time.ts` (`300000 → "5 min"`, `<60s → "Ns"`, `≥1h → "1h 03m"`).

- [ ] **Step 1: Write the failing label tests**

Add to `src/components/home/entryLabel.test.ts` (build entries with the file's existing helper/factory; if it constructs literals, include all `Entry` fields it already sets plus `left_ms`/`right_ms`):

```ts
it('breast shows both sides when both have time', () => {
  const e = makeEntry({ type: 'breast', side: 'both', start_ts: 0, end_ts: 480_000,
    left_ms: 300_000, right_ms: 180_000 })
  expect(entryLabel(e)).toEqual({ icon: '🤱', text: 'Breast · L 5 min / R 3 min' })
})

it('breast shows a single side when only one has time', () => {
  const e = makeEntry({ type: 'breast', side: 'L', start_ts: 0, end_ts: 300_000,
    left_ms: 300_000, right_ms: 0 })
  expect(entryLabel(e)).toEqual({ icon: '🤱', text: 'Breast · L · 5 min' })
})

it('breast falls back to side + duration for legacy rows without per-side data', () => {
  const e = makeEntry({ type: 'breast', side: 'both', start_ts: 0, end_ts: 480_000,
    left_ms: null, right_ms: null })
  expect(entryLabel(e)).toEqual({ icon: '🤱', text: 'Breast · both · 8 min' })
})
```

If the test file has no `makeEntry` helper, construct the entries inline the same way the existing tests in that file do.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --run src/components/home/entryLabel.test.ts`
Expected: FAIL — current label produces `Breast · both · 8 min` for the per-side cases.

- [ ] **Step 3: Implement the per-side label**

In `src/components/home/entryLabel.ts`, replace the `case 'breast':` block:

```ts
    case 'breast': {
      if (e.left_ms != null || e.right_ms != null) {
        const l = e.left_ms ?? 0
        const r = e.right_ms ?? 0
        const detail = l > 0 && r > 0
          ? `L ${formatDuration(l)} / R ${formatDuration(r)}`
          : r > 0
            ? `R · ${formatDuration(r)}`
            : `L · ${formatDuration(l)}`
        return { icon: '🤱', text: `Breast · ${detail}` }
      }
      return { icon: '🤱', text: ['Breast', e.side, dur].filter(Boolean).join(' · ') }
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- --run src/components/home/entryLabel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/entryLabel.ts src/components/home/entryLabel.test.ts
git commit -m "feat: per-side breakdown in breast timeline label"
```

---

## Task 4: The BreastSession page + styles

**Files:**
- Create: `src/components/home/BreastSession.tsx`
- Create: `src/components/home/BreastSession.test.tsx`
- Modify: `src/styles/theme.css`

**Interfaces:**
- Consumes: `startBreastSide`, `pauseBreastSide`, `insertEntry`, `clearTimer`, `setTimerStart`, `getSetting` (queries); `breastTotals`, `deriveSide` (`src/lib/breast.ts`); `useActiveTimer` (`../../state/useActiveTimer`); `formatElapsed`, `clampStartTs` (`../../lib/timer`); `Stepper`, `TimeField` (`./forms/formKit`).
- Produces: `BreastSession` React component with props `{ syncSignal: number; onClose: () => void; onCommitted: () => void }` (identical shape to `SleepSession`).

- [ ] **Step 1: Write the failing component tests**

Create `src/components/home/BreastSession.test.tsx`. Mirror the setup used in `SleepSession.test.tsx` (same provider/render helpers, fake timers if that file uses them). Base cases:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DbProvider } from '../../db/client'
import { makeTestExecutor } from '../../db/testExecutor'
import { listEntries, getActiveTimer } from '../../db/queries'
import { BreastSession } from './BreastSession'

// If SleepSession.test.tsx wraps a WorkerExecutor differently, copy that exact harness.
async function setup() {
  const db = await makeTestExecutor()
  const onCommitted = vi.fn()
  render(
    <DbProvider executor={db as never}>
      <BreastSession syncSignal={0} onClose={() => {}} onCommitted={onCommitted} />
    </DbProvider>,
  )
  return { db, onCommitted }
}

describe('BreastSession', () => {
  it('tapping L starts the left timer', async () => {
    const { db } = await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Left breast' }))
    await waitFor(async () => {
      const t = await getActiveTimer(db)
      expect(t?.type).toBe('breast')
      expect(t?.side).toBe('L')
    })
  })

  it('Save writes a breast entry with per-side durations and clears the timer', async () => {
    const { db, onCommitted } = await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Left breast' }))
    await waitFor(async () => expect((await getActiveTimer(db))?.side).toBe('L'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onCommitted).toHaveBeenCalled())
    const entries = await listEntries(db, { type: 'breast' })
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe('breast')
    expect(await getActiveTimer(db)).toBeNull()
  })
})
```

Adjust the render harness to match `SleepSession.test.tsx` exactly (it is the source of truth for how this project mounts a DB-backed component in tests). Keep the two assertions above regardless of harness details.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --run src/components/home/BreastSession.test.tsx`
Expected: FAIL — `./BreastSession` not found.

- [ ] **Step 3: Implement `BreastSession.tsx`**

Create `src/components/home/BreastSession.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { useDb } from '../../db/client'
import { useActiveTimer } from '../../state/useActiveTimer'
import {
  insertEntry, clearTimer, setTimerStart, getSetting,
  startBreastSide, pauseBreastSide,
} from '../../db/queries'
import { formatElapsed, clampStartTs } from '../../lib/timer'
import { breastTotals, deriveSide } from '../../lib/breast'
import { Stepper, TimeField } from './forms/formKit'

const EMPTY = {
  amount_ml: null, milk_type: null, food: null, diaper_kind: null,
  med_name: null, med_dose: null, photo_id: null,
} as const

export interface BreastSessionProps {
  syncSignal: number
  onClose: () => void       // back arrow — keep the timer running
  onCommitted: () => void   // saved / cancelled / external-stop acked
}

export function BreastSession({ syncSignal, onClose, onCommitted }: BreastSessionProps) {
  const db = useDb()
  const { timer, refresh } = useActiveTimer()
  const running = timer?.type === 'breast'

  const [now, setNow] = useState(Date.now())
  const [lastSide, setLastSide] = useState<'L' | 'R' | null>(null)
  const [manual, setManual] = useState(false)
  const [leftMin, setLeftMin] = useState(10)
  const [rightMin, setRightMin] = useState(0)
  const [manualTs, setManualTs] = useState(Date.now())
  const [note, setNote] = useState('')
  const [editingStart, setEditingStart] = useState(false)
  const [externalStopped, setExternalStopped] = useState(false)

  const committing = useRef(false)
  const wasRunning = useRef(false)

  // Tick while a side is actively running so the displayed clocks advance.
  useEffect(() => {
    if (!(running && timer!.side)) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running, timer])

  // Live-sync: re-read the timer whenever the app's sync signal changes.
  useEffect(() => { void refresh() }, [syncSignal, refresh])

  // Last-used side for the badge (only meaningful before this session accrues time).
  useEffect(() => {
    void getSetting(db, 'breast_last_side').then((v) => setLastSide(v === 'R' ? 'R' : v === 'L' ? 'L' : null))
  }, [db, syncSignal])

  // Detect the other caregiver ending the session out from under us.
  useEffect(() => {
    if (wasRunning.current && !timer && !committing.current) setExternalStopped(true)
    if (running) wasRunning.current = true
  }, [timer, running])

  const totals = running ? breastTotals(timer!, now) : { left: 0, right: 0, total: 0 }

  async function tap(side: 'L' | 'R') {
    if (running && timer!.side === side) await pauseBreastSide(db, Date.now())
    else await startBreastSide(db, side, Date.now())
    await refresh()
    setNow(Date.now())
  }

  async function editStart(ts: number) {
    if (!timer) return
    await setTimerStart(db, 'breast', clampStartTs(ts, Date.now(), null))
    await refresh()
    setEditingStart(false)
  }

  async function save() {
    if (!timer || committing.current) return
    const { left, right, total } = breastTotals(timer, Date.now())
    if (total === 0) return
    committing.current = true
    await insertEntry(db, {
      type: 'breast', start_ts: timer.start_ts, end_ts: timer.start_ts + total,
      side: deriveSide(left, right), left_ms: left, right_ms: right,
      note: note.trim() || null, ...EMPTY,
    })
    await clearTimer(db, 'breast')
    onCommitted()
  }

  async function cancel() {
    if (!window.confirm('Discard this nursing session?')) return
    committing.current = true
    await clearTimer(db, 'breast')
    onCommitted()
  }

  async function saveManual() {
    if (committing.current) return
    const left = leftMin * 60_000
    const right = rightMin * 60_000
    const total = left + right
    if (total === 0) return
    committing.current = true
    await insertEntry(db, {
      type: 'breast', start_ts: manualTs, end_ts: manualTs + total,
      side: deriveSide(left, right), left_ms: left, right_ms: right,
      note: note.trim() || null, ...EMPTY,
    })
    onCommitted()
  }

  if (externalStopped) {
    return (
      <div className="breast-page">
        <div className="sleep-notice">
          <p>This nursing session was ended on another device.</p>
          <button className="btn-primary" onClick={onCommitted}>OK</button>
        </div>
      </div>
    )
  }

  return (
    <div className="breast-page">
      <header className="sleep-head">
        <button className="sleep-back" aria-label="Back" onClick={onClose}>‹</button>
        <span>NURSING</span>
        <span className="sleep-head-spacer" />
      </header>
      <p className="breast-tag">#liquidgold</p>

      {!manual && (
        <>
          <div className="sleep-duration">{formatElapsed(totals.total)}</div>
          <div className="sleep-duration-label">Feed duration</div>

          <div className="breast-sides">
            {(['L', 'R'] as const).map((s) => (
              <div key={s} className="breast-col">
                {lastSide === s && <span className="breast-last">Last</span>}
                <button
                  className={`breast-circle ${running && timer!.side === s ? 'active' : ''}`}
                  aria-label={s === 'L' ? 'Left breast' : 'Right breast'}
                  onClick={() => tap(s)}
                >{s}</button>
                <div className="breast-side-time">
                  {formatElapsed(s === 'L' ? totals.left : totals.right)}
                </div>
              </div>
            ))}
          </div>

          <p className="breast-hint">
            Tap the L or R button to start the timer.<br />
            Tap it once again if you wish to pause or stop.
          </p>

          {running && (
            <div className="sleep-startrow">
              <span>started at</span>
              {editingStart ? (
                <TimeField value={timer!.start_ts} onChange={editStart} />
              ) : (
                <>
                  <b>{new Date(timer!.start_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b>
                  <button className="sleep-edit" aria-label="Edit start time"
                    onClick={() => setEditingStart(true)}>✎</button>
                </>
              )}
            </div>
          )}

          <textarea className="sleep-note" placeholder="Your note (optional)"
            value={note} onChange={(e) => setNote(e.target.value)} />

          {!running && (
            <button className="btn-link" onClick={() => setManual(true)}>ENTER TIME MANUALLY</button>
          )}

          <div className="sleep-actions">
            <button className="btn-ghost" onClick={running ? cancel : onClose}>Cancel</button>
            <button className="btn-primary" onClick={save}>Save</button>
          </div>
        </>
      )}

      {manual && (
        <div className="sleep-manual">
          <Stepper label="left" value={leftMin} step={1} min={0} unit="min" onChange={setLeftMin} />
          <Stepper label="right" value={rightMin} step={1} min={0} unit="min" onChange={setRightMin} />
          <TimeField value={manualTs} onChange={setManualTs} />
          <textarea className="sleep-note" placeholder="Your note (optional)"
            value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="sleep-actions">
            <button className="btn-ghost" onClick={() => setManual(false)}>Cancel</button>
            <button className="btn-primary" onClick={saveManual}>Save</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add styles**

Append to `src/styles/theme.css` (reuse sleep-page tokens; adjust variable names to those the file already defines for `.sleep-page`):

```css
.breast-page { padding: 16px; min-height: 100%; }
.breast-tag { text-align: center; color: var(--muted, #8a8a9a); margin: 2px 0 12px; }
.breast-sides { display: flex; justify-content: center; gap: 40px; margin: 12px 0 4px; }
.breast-col { display: flex; flex-direction: column; align-items: center; position: relative; }
.breast-circle {
  width: 120px; height: 120px; border-radius: 50%; border: none;
  background: var(--surface-2, #2b2b3d); color: var(--accent, #79d3c4);
  font-size: 44px; font-weight: 700;
}
.breast-circle.active { outline: 3px solid var(--accent, #79d3c4); }
.breast-side-time { margin-top: 8px; font-variant-numeric: tabular-nums; }
.breast-last {
  position: absolute; top: -10px; z-index: 1;
  background: var(--gold, #b8912f); color: #1c1c28;
  border-radius: 999px; padding: 2px 12px; font-size: 13px; font-weight: 600;
}
.breast-hint { text-align: center; color: var(--muted, #8a8a9a); margin: 16px 0; }
```

- [ ] **Step 5: Run the component tests to verify pass**

Run: `npm test -- --run src/components/home/BreastSession.test.tsx`
Expected: PASS. (If the render harness differs, fix the test setup to match `SleepSession.test.tsx`, not the component.)

- [ ] **Step 6: Commit**

```bash
git add src/components/home/BreastSession.tsx src/components/home/BreastSession.test.tsx src/styles/theme.css
git commit -m "feat: BreastSession per-side nursing page"
```

---

## Task 5: Wire the page in; retire the breast form

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/home/Home.tsx`
- Modify: `src/components/home/TimerBanner.tsx`
- Modify: `src/components/home/LogSheet.tsx`
- Delete: `src/components/home/forms/BreastForm.tsx`
- Test: `src/components/home/Home.test.tsx`

**Interfaces:**
- Consumes: `BreastSession` (Task 4) with props `{ syncSignal, onClose, onCommitted }`.
- Produces: `Home` gains an `onOpenBreast: () => void` prop; breast quick-log and breast banner tap both call it.

- [ ] **Step 1: Update the Home test for the new routing**

In `src/components/home/Home.test.tsx`, follow the existing pattern used for `onOpenSleep` (Home already takes that prop). Add an `onOpenBreast` mock to the render helper and assert:

```tsx
it('tapping the Breast quick-log button opens the breast page', () => {
  const onOpenBreast = vi.fn()
  renderHome({ onOpenBreast }) // extend the file's existing render helper with the new prop
  fireEvent.click(screen.getByText('Breast'))
  expect(onOpenBreast).toHaveBeenCalled()
})

it('tapping a running breast timer banner opens the breast page (does not stop it)', () => {
  const onOpenBreast = vi.fn()
  // Arrange an active breast timer exactly the way the existing sleep-banner test does.
  renderHomeWithBreastTimer({ onOpenBreast })
  fireEvent.click(screen.getByRole('button', { name: /tap to open/i }))
  expect(onOpenBreast).toHaveBeenCalled()
})
```

Match the file's real render helper names/signatures; the two assertions (quick-log opens page, banner tap opens page) are the point.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --run src/components/home/Home.test.tsx`
Expected: FAIL — `onOpenBreast` not a prop; breast still routes to the sheet / `stopTimer`.

- [ ] **Step 3: Update `Home.tsx`**

Add `onOpenBreast` to the props type and destructuring:

```tsx
export function Home({
  onLog, onSelectEntry, onOpenSleep, onOpenBreast, onSeeAll,
}: {
  onLog: (t: LogTarget) => void
  onSelectEntry: (e: Entry) => void
  onOpenSleep: () => void
  onOpenBreast: () => void
  onSeeAll: () => void
}) {
```

Delete the now-unused `stopTimer` function (lines defining `async function stopTimer()`), and remove `insertEntry` and `clearTimer` from the `../../db/queries` import if they become unused (keep `lastEntryByType`). Update the banner and grid:

```tsx
      {timer && (
        <TimerBanner
          timer={timer}
          elapsed={elapsed}
          onStop={timer.type === 'sleep' ? onOpenSleep : onOpenBreast}
        />
      )}
      <QuickLogGrid
        lasts={lasts}
        onLog={(t) => (t === 'sleep' ? onOpenSleep() : t === 'breast' ? onOpenBreast() : onLog(t))}
        now={now}
      />
```

(`elapsed` from `useActiveTimer` is the raw start-based elapsed; the banner already shows it for breast today. Leave the banner's displayed value as-is.)

- [ ] **Step 4: Update `TimerBanner.tsx` copy**

Change the stop hint text:

```tsx
        <span className="tb-stop">Tap to open</span>
```

- [ ] **Step 5: Update `App.tsx`**

Add breast state, import, render, and pass the prop:

```tsx
import { BreastSession } from './components/home/BreastSession'
```

```tsx
  const [breastOpen, setBreastOpen] = useState(false)
```

In the `<Home>` element:

```tsx
          <Home
            key={refreshKey}
            onLog={setTarget}
            onSelectEntry={setEditing}
            onOpenSleep={() => setSleepOpen(true)}
            onOpenBreast={() => setBreastOpen(true)}
            onSeeAll={() => setTab('history')}
          />
```

After the `{sleepOpen && (...)}` block:

```tsx
      {breastOpen && (
        <BreastSession
          syncSignal={refreshKey}
          onClose={() => setBreastOpen(false)}
          onCommitted={() => { setBreastOpen(false); setRefreshKey((k) => k + 1) }}
        />
      )}
```

- [ ] **Step 6: Remove breast from the log sheet and delete the form**

In `src/components/home/LogSheet.tsx`, drop the breast import and map entry:

```tsx
import { BottleForm } from './forms/BottleForm'
```

```tsx
const FORMS: Record<string, (p: FormProps) => JSX.Element> = {
  bottle: BottleForm, solids: SolidsForm,
  diaper: DiaperForm, meds: MedsForm, note: NoteForm,
}
```

Delete the file:

```bash
git rm src/components/home/forms/BreastForm.tsx
```

- [ ] **Step 7: Run the full suite + typecheck**

Run: `npm test -- --run`
Expected: PASS.
Run: `npm run build`
Expected: typecheck/build succeeds (no dangling `BreastForm` import, no unused `stopTimer`).

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/components/home/Home.tsx src/components/home/TimerBanner.tsx src/components/home/LogSheet.tsx src/components/home/Home.test.tsx
git rm src/components/home/forms/BreastForm.tsx
git commit -m "feat: route breast to the nursing page; banner tap opens it; remove breast sheet form"
```

---

## Manual verification (after Task 5)

Run the app (`/run` or the project dev command) and confirm on the Home screen:

1. Tap **Breast** → the NURSING page opens (not a bottom sheet).
2. Tap **L** → left timer and total advance; tap **L** again → pauses. Tap **R** → left commits, right runs. The **Feed duration** total = L + R.
3. **Save** → a breast entry appears in the timeline as `Breast · L … / R …`; the **Last** badge shows the last-tapped side next time.
4. Start a breast timer, go **Back**, then tap the **running banner** → the NURSING page reopens (the timer keeps running; it does **not** stop).
5. **Enter time manually** → set Left/Right minutes → Save writes the entry.

---

## Self-Review notes

- **Spec coverage:** entries + active_timer columns (Task 1), one-side-at-a-time queries + totals + last-side setting (Task 2), per-side history label with legacy fallback (Task 3), the NURSING page with total/L/R/Last/edit-start/manual/external-stop + styles (Task 4), banner-opens-page + quick-log routing + form removal + "Tap to open" copy (Task 5). `computeDailyTotals` untouched by design. `EditEntrySheet` intentionally unchanged (per updated spec: edit stays generic; per-side editing deferred).
- **Type consistency:** `startBreastSide`/`pauseBreastSide`/`breastTotals`/`deriveSide` signatures match between Task 2 (definition) and Task 4 (use). `NewEntry`'s optional `left_ms`/`right_ms` keep existing `insertEntry` callers compiling; breast passes them explicitly.
- **Deferred/assumed:** the test render harness for DB-backed components is taken from `SleepSession.test.tsx` / `Home.test.tsx` (source of truth); the implementer copies those exact patterns rather than the illustrative harness shown here.

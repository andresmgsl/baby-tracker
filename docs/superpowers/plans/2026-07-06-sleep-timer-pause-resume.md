# Sleep Timer Pause/Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sleep timer's STOP button a true pause — pressing it again resumes, and paused time is excluded from the recorded sleep duration.

**Architecture:** Move pause state from local React state into the `active_timer` DB row (two new columns) so both caregivers' phones agree via live sync. A pure `netElapsed()` computes duration minus paused gaps. The one button toggles STOP↔RESUME off DB state; Save records `end_ts = start_ts + net`.

**Tech Stack:** TypeScript, React 18, better-sqlite3 (server + in-memory test executor), Vitest.

## Global Constraints

- No migration framework exists — schema is `CREATE TABLE IF NOT EXISTS` only. New columns must be added to `SCHEMA_SQL` **and** applied to the existing Pi DB via an idempotent `PRAGMA table_info` guarded `ALTER TABLE`.
- The **breast** timer must be unaffected — it never pauses. `netElapsed` with `paused_ms=0, paused_at=null` must equal the old `elapsedMs`.
- Follow existing code style: 2-space indent, no semicolons, single quotes, small focused functions.
- `start_ts` on a saved entry stays the real clock start; only `end_ts` absorbs the net-duration convention.

---

### Task 1: DB schema columns + idempotent migration

**Files:**
- Modify: `src/db/schema.ts:44-48` (active_timer table)
- Modify: `server/store.ts` (add `ensureActiveTimerColumns`, call it after each `db.exec(SCHEMA_SQL)`)
- Test: `server/store.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `active_timer` rows now carry `paused_ms INTEGER NOT NULL DEFAULT 0` and `paused_at INTEGER` (nullable). Exported `ensureActiveTimerColumns(db: Database.Database): void`.

- [ ] **Step 1: Write the failing migration test**

Create `server/store.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStore } from './store'

const paths: string[] = []
const tempPath = () => {
  const p = join(tmpdir(), `bt-store-${paths.length}-test.sqlite3`)
  paths.push(p)
  return p
}
afterEach(() => { for (const p of paths.splice(0)) rmSync(p, { force: true }) })

describe('openStore migration', () => {
  it('adds pause columns to a pre-existing active_timer table and preserves rows', () => {
    const path = tempPath()
    // Simulate an old DB: active_timer without the pause columns, with a live timer.
    const old = new Database(path)
    old.exec(`CREATE TABLE active_timer (type TEXT PRIMARY KEY, start_ts INTEGER NOT NULL, side TEXT)`)
    old.prepare('INSERT INTO active_timer (type, start_ts, side) VALUES (?, ?, ?)').run('sleep', 1000, null)
    old.close()

    const store = openStore(path)
    const cols = store.exec('PRAGMA table_info(active_timer)').map((c) => c.name)
    expect(cols).toContain('paused_ms')
    expect(cols).toContain('paused_at')

    const [row] = store.exec('SELECT * FROM active_timer')
    expect(row.start_ts).toBe(1000)
    expect(row.paused_ms).toBe(0)
    expect(row.paused_at).toBeNull()
    store.close()
  })

  it('is a no-op on a fresh DB (columns already present)', () => {
    const store = openStore(tempPath())
    const cols = store.exec('PRAGMA table_info(active_timer)').map((c) => c.name)
    expect(cols).toContain('paused_ms')
    expect(cols).toContain('paused_at')
    store.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/store.test.ts`
Expected: FAIL — first test asserts `paused_ms` present but the migration doesn't exist yet.

- [ ] **Step 3: Add the columns to the canonical schema**

In `src/db/schema.ts`, change the `active_timer` table to:

```sql
CREATE TABLE IF NOT EXISTS active_timer (
  type TEXT PRIMARY KEY,
  start_ts INTEGER NOT NULL,
  side TEXT,
  paused_ms INTEGER NOT NULL DEFAULT 0,
  paused_at INTEGER
);
```

- [ ] **Step 4: Add the idempotent migration in `server/store.ts`**

Add this helper near the top of `server/store.ts` (after imports):

```ts
function ensureActiveTimerColumns(db: Database.Database): void {
  const names = new Set(
    (db.prepare('PRAGMA table_info(active_timer)').all() as { name: string }[]).map((c) => c.name),
  )
  if (!names.has('paused_ms')) db.exec('ALTER TABLE active_timer ADD COLUMN paused_ms INTEGER NOT NULL DEFAULT 0')
  if (!names.has('paused_at')) db.exec('ALTER TABLE active_timer ADD COLUMN paused_at INTEGER')
}
```

Call it right after **both** `db.exec(SCHEMA_SQL)` sites. In `openStore`, line ~20:

```ts
  let db = new Database(dbPath)
  db.exec(SCHEMA_SQL)
  ensureActiveTimerColumns(db)
```

And inside `replace()`, after the final `db.exec(SCHEMA_SQL)` (line ~50):

```ts
      db = new Database(dbPath)
    }
    db.exec(SCHEMA_SQL)
    ensureActiveTimerColumns(db)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run server/store.test.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts server/store.ts server/store.test.ts
git commit -m "feat: add pause columns to active_timer with idempotent migration"
```

---

### Task 2: `netElapsed` pure function

**Files:**
- Modify: `src/lib/timer.ts`
- Test: `src/lib/timer.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `netElapsed(startTs: number, pausedMs: number, pausedAt: number | null, now: number): number`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/timer.test.ts` (and add `netElapsed` to the import on line 2):

```ts
describe('netElapsed', () => {
  it('ticks while running (no pause)', () => {
    expect(netElapsed(1000, 0, null, 5000)).toBe(4000)
  })
  it('subtracts accumulated paused time while running', () => {
    expect(netElapsed(1000, 1500, null, 5000)).toBe(2500)
  })
  it('freezes at pausedAt while paused, minus accumulated pauses', () => {
    // frozen: 8000 - 1000 - 2000 = 5000, independent of `now`
    expect(netElapsed(1000, 2000, 8000, 999_999)).toBe(5000)
  })
  it('never goes negative', () => {
    expect(netElapsed(5000, 0, null, 1000)).toBe(0)
    expect(netElapsed(1000, 10_000, null, 5000)).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/timer.test.ts`
Expected: FAIL — `netElapsed is not a function`.

- [ ] **Step 3: Implement `netElapsed`**

Add to `src/lib/timer.ts` (after `elapsedMs`):

```ts
/**
 * Elapsed time excluding paused gaps. While paused (pausedAt != null) the value
 * is frozen at the moment the pause began. `pausedMs` is the sum of prior pauses.
 */
export function netElapsed(startTs: number, pausedMs: number, pausedAt: number | null, now: number): number {
  const end = pausedAt ?? now
  return Math.max(0, end - startTs - pausedMs)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/timer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timer.ts src/lib/timer.test.ts
git commit -m "feat: add netElapsed for pause-aware duration"
```

---

### Task 3: Types + timer queries (pause/resume/setStart)

**Files:**
- Modify: `src/db/types.ts:33`
- Modify: `src/db/queries.ts:112-129`
- Test: `src/db/queries.test.ts`

**Interfaces:**
- Consumes: `SqlExecutor`, `ActiveTimer` (from Task 1 columns).
- Produces:
  - `ActiveTimer` gains `paused_ms: number` and `paused_at: number | null`.
  - `startTimer(exec, t: { type: ActiveTimer['type']; start_ts: number; side: ActiveTimer['side'] }): Promise<void>` — resets pause state.
  - `setTimerStart(exec, type: ActiveTimer['type'], start_ts: number): Promise<void>`.
  - `pauseTimer(exec, type: ActiveTimer['type'], now: number): Promise<void>`.
  - `resumeTimer(exec, type: ActiveTimer['type'], now: number): Promise<void>`.
  - `getActiveTimer` returns the two new fields.

- [ ] **Step 1: Write the failing tests**

In `src/db/queries.test.ts`, add `setTimerStart, pauseTimer, resumeTimer` to the import (line 4-9), then add inside the `describe('active timer', ...)` block:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/db/queries.test.ts`
Expected: FAIL — `pauseTimer`/`resumeTimer`/`setTimerStart` not exported; `paused_ms` undefined.

- [ ] **Step 3: Update the `ActiveTimer` type**

In `src/db/types.ts`, line 33:

```ts
export interface ActiveTimer {
  type: 'breast' | 'sleep'
  start_ts: number
  side: Side | null
  paused_ms: number
  paused_at: number | null
}
```

- [ ] **Step 4: Update queries**

Replace the timer functions in `src/db/queries.ts` (lines 112-129) with:

```ts
export async function startTimer(
  exec: SqlExecutor,
  t: { type: ActiveTimer['type']; start_ts: number; side: ActiveTimer['side'] },
): Promise<void> {
  await exec.exec(
    `INSERT INTO active_timer (type, start_ts, side, paused_ms, paused_at) VALUES (?, ?, ?, 0, NULL)
     ON CONFLICT(type) DO UPDATE SET start_ts = excluded.start_ts, side = excluded.side, paused_ms = 0, paused_at = NULL`,
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
  }
}

export async function clearTimer(exec: SqlExecutor, type: ActiveTimer['type']): Promise<void> {
  await exec.exec('DELETE FROM active_timer WHERE type = ?', [type])
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/db/queries.test.ts`
Expected: PASS (existing timer test + 5 new).

- [ ] **Step 6: Commit**

```bash
git add src/db/types.ts src/db/queries.ts src/db/queries.test.ts
git commit -m "feat: add pauseTimer/resumeTimer/setTimerStart queries"
```

---

### Task 4: `useActiveTimer` freezes while paused

**Files:**
- Modify: `src/state/useActiveTimer.ts`
- Test: `src/state/useActiveTimer.test.tsx`

**Interfaces:**
- Consumes: `getActiveTimer` (Task 3), `netElapsed` (Task 2).
- Produces: `elapsed` is now net-of-pauses and stops ticking while paused. `{ timer, elapsed, refresh }` shape unchanged.

- [ ] **Step 1: Write the failing test**

The file uses **fake timers** (`vi.useFakeTimers()` in `beforeEach`, `vi.setSystemTime`) and drains microtasks with `act` — `waitFor` deadlocks under fake timers, so do NOT use it. Add `pauseTimer` to the import on line 6 (`import { startTimer, pauseTimer } from '../db/queries'`), then add inside the `describe('useActiveTimer', …)` block:

```ts
  it('reports frozen net elapsed while paused and does not tick', async () => {
    vi.setSystemTime(10_000)
    await startTimer(exec, { type: 'sleep', start_ts: 1_000, side: null })
    await pauseTimer(exec, 'sleep', 4_000) // net frozen at 3_000ms
    const { result } = renderHook(() => useActiveTimer(), { wrapper })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.timer?.paused_at).toBe(4_000)
    expect(result.current.elapsed).toBe(3_000)
    // Advancing the clock must NOT change elapsed — the timer is paused.
    await act(async () => { vi.advanceTimersByTime(5_000) })
    expect(result.current.elapsed).toBe(3_000)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/state/useActiveTimer.test.tsx`
Expected: FAIL — `elapsed` is `3000`-ish only if net logic exists; currently it uses `elapsedMs(start, now)` which is `now-1000`, not 3000.

- [ ] **Step 3: Update the hook**

In `src/state/useActiveTimer.ts`, change the import on line 4 from `elapsedMs` to `netElapsed`, and replace the tick effect (lines 18-24):

```ts
  useEffect(() => {
    if (!timer) { setElapsed(0); return }
    const tick = () => setElapsed(netElapsed(timer.start_ts, timer.paused_ms, timer.paused_at, Date.now()))
    tick()
    if (timer.paused_at != null) return // paused: value is frozen, no interval
    const h = setInterval(tick, 1000)
    return () => clearInterval(h)
  }, [timer])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/state/useActiveTimer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/useActiveTimer.ts src/state/useActiveTimer.test.tsx
git commit -m "feat: freeze useActiveTimer elapsed while paused"
```

---

### Task 5: SleepSession STOP↔RESUME UI + net-duration save

**Files:**
- Modify: `src/components/home/SleepSession.tsx`
- Modify: `src/styles/theme.css:585` (add `.sleep-stop.paused`)
- Test: `src/components/home/SleepSession.test.tsx`

**Interfaces:**
- Consumes: `pauseTimer`, `resumeTimer`, `setTimerStart` (Task 3), `netElapsed`, `clampStartTs` (Task 2), `useActiveTimer` (Task 4).
- Produces: user-facing behavior — button reads STOP while running, RESUME while paused; duration freezes while paused; Save stores `end_ts = start_ts + net`.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/home/SleepSession.test.tsx`. Add `pauseTimer` to the import on line 6.

```ts
  it('STOP pauses the timer and the button becomes RESUME', async () => {
    await startTimer(exec, { type: 'sleep', start_ts: 1_000, side: null })
    renderPage()
    await flush()
    fireEvent.click(screen.getByRole('button', { name: /^stop$/i }))
    await flush()
    expect((await getActiveTimer(exec))?.paused_at).not.toBeNull()
    expect(screen.getByRole('button', { name: /^resume$/i })).toBeTruthy()
  })

  it('RESUME clears the pause', async () => {
    await startTimer(exec, { type: 'sleep', start_ts: 1_000, side: null })
    await pauseTimer(exec, 'sleep', 5_000)
    renderPage()
    await flush()
    fireEvent.click(screen.getByRole('button', { name: /^resume$/i }))
    await flush()
    expect((await getActiveTimer(exec))?.paused_at).toBeNull()
    expect(screen.getByRole('button', { name: /^stop$/i })).toBeTruthy()
  })

  it('saves net duration, excluding the paused gap', async () => {
    // start 1000, paused at 5000 with 0 prior pause → net 4000 → end_ts 5000
    await startTimer(exec, { type: 'sleep', start_ts: 1_000, side: null })
    await pauseTimer(exec, 'sleep', 5_000)
    renderPage()
    await flush()
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await flush()
    const [entry] = await listEntries(exec, { type: 'sleep' })
    expect(entry.start_ts).toBe(1_000)
    expect(entry.end_ts).toBe(5_000)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/home/SleepSession.test.tsx`
Expected: FAIL — no RESUME button; STOP currently disables to "STOPPED"; save uses `Date.now()` not net.

- [ ] **Step 3: Rewrite the component's timer wiring**

In `src/components/home/SleepSession.tsx`:

Update imports (lines 4-5):

```ts
import { insertEntry, startTimer, clearTimer, setTimerStart, pauseTimer, resumeTimer } from '../../db/queries'
import { formatElapsed, netElapsed, clampStartTs } from '../../lib/timer'
```

Remove the `endTs` state (line 28) and the `wasRunning`-adjacent `endTs` usages. Add a `paused` derivation after `running` (line 22):

```ts
  const running = timer?.type === 'sleep'
  const paused = running && timer!.paused_at != null
```

Replace `editStart` (lines 49-55) to preserve pauses:

```ts
  async function editStart(ts: number) {
    if (!timer) return
    const clamped = clampStartTs(ts, Date.now(), timer.paused_at)
    await setTimerStart(db, 'sleep', clamped)
    await refresh()
    setEditingStart(false)
  }
```

Add pause/resume handlers (near `start`):

```ts
  async function pause() {
    if (!timer) return
    await pauseTimer(db, 'sleep', Date.now())
    await refresh()
  }
  async function resume() {
    if (!timer) return
    await resumeTimer(db, 'sleep', Date.now())
    await refresh()
  }
```

Replace `save` (lines 57-66) so `end_ts` is the net duration:

```ts
  async function save() {
    if (!timer || committing.current) return
    committing.current = true
    const end_ts = timer.start_ts + netElapsed(timer.start_ts, timer.paused_ms, timer.paused_at, Date.now())
    await insertEntry(db, {
      type: 'sleep', start_ts: timer.start_ts, end_ts,
      note: note.trim() || null, ...EMPTY,
    })
    await clearTimer(db, 'sleep')
    onCommitted()
  }
```

Replace the `duration` line (line 85) — `elapsed` from the hook is already net and frozen-when-paused:

```ts
  const duration = elapsed
```

In the running block, replace the STOP button (lines 131-134) with a toggle:

```tsx
          <button className={`sleep-stop ${paused ? 'paused' : ''}`}
            onClick={paused ? resume : pause}>
            {paused ? 'RESUME' : 'STOP'}
          </button>
```

Also update the edit-start `TimeField` (line 139) to clamp against the effective end — it already calls `editStart`, no change needed there. Leave `cancel`, `saveManual`, `externalStopped`, and the manual/prestart branches unchanged.

- [ ] **Step 4: Add the paused button style**

In `src/styles/theme.css`, after line 585 (`.sleep-stop.stopped { ... }`), add:

```css
.sleep-stop.paused { background: var(--c-sleep); color: var(--panel); }
```

- [ ] **Step 5: Run the full test suite + typecheck**

Run: `npx vitest run && npx tsc -b`
Expected: PASS — all suites green, no type errors. (`tsc -b` catches any stale `endTs`/`elapsedMs` references.)

- [ ] **Step 6: Commit**

```bash
git add src/components/home/SleepSession.tsx src/components/home/SleepSession.test.tsx src/styles/theme.css
git commit -m "feat: sleep timer STOP button toggles pause/resume, saves net duration"
```

---

## Self-Review

**Spec coverage:**
- Schema columns + idempotent migration → Task 1 ✓
- `netElapsed` pure fn → Task 2 ✓
- `getActiveTimer` fields, `startTimer` reset, `setTimerStart`, `pauseTimer`, `resumeTimer` → Task 3 ✓
- Hook freeze while paused → Task 4 ✓
- UI STOP/RESUME toggle + net-duration save + clamp + external-stop preserved → Task 5 ✓
- Breast timer unaffected → guaranteed by `netElapsed(…,0,null,…) === elapsedMs` (Task 2 tests) ✓
- Tests: `netElapsed`, pause/resume column math, STOP↔RESUME, frozen-while-paused, net save, migration → all present ✓

**Placeholder scan:** No TBD/TODO. The one note in Task 4 Step 1 directs the implementer to mirror the existing test file's harness because that file's render helper is not quoted here — the assertion and logic are fully specified.

**Type consistency:** `ActiveTimer` fields `paused_ms`/`paused_at` used consistently across Tasks 3-5. `startTimer` param narrowed to `{type,start_ts,side}` so existing call sites (SleepSession `start`, all tests) still compile. `pauseTimer`/`resumeTimer`/`setTimerStart` signatures identical everywhere referenced. `netElapsed(startTs, pausedMs, pausedAt, now)` argument order consistent in hook and component.

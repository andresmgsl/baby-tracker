# Sleep timer: pause / resume — design

**Date:** 2026-07-06
**Status:** Approved, ready for implementation plan

## Problem

On the sleep timer, pressing **STOP** currently freezes the duration and disables
the button (shows "STOPPED"); the user then Saves or Cancels. The requested
behavior: the same button should let you **resume**, and a resume must be a *true
pause* — the stopped interval is excluded from the recorded sleep duration.

Today "stop" is purely local React state (`endTs` in `SleepSession.tsx`) — it never
touches the database. That worked when stop was immediately followed by Save. A true
pause that can persist and that the **other caregiver's phone must agree with** (live
sync shipped recently) has to live in the database. Otherwise phone B keeps ticking
while phone A shows paused, and the "stopped on another device" detection misfires.

## Approach

Store pause state on the existing `active_timer` row (one row per timer type).

Rejected alternatives:
- **`pause_intervals` table** — fully normalized pause history. Overkill; we never
  display individual pauses, only exclude their total. YAGNI.
- **Local-only state** — breaks cross-device sync and can't survive an app reload.

## Data model

`active_timer` gains two columns:

| column      | type                        | meaning                                        |
|-------------|-----------------------------|------------------------------------------------|
| `paused_ms` | `INTEGER NOT NULL DEFAULT 0`| accumulated duration of completed pauses        |
| `paused_at` | `INTEGER` (nullable)        | when the *current* pause began; `NULL` = running |

### Migration

No migration system exists (`CREATE TABLE IF NOT EXISTS` only), and the Pi already
holds a live DB, so the change must be additive and idempotent:

1. Add both columns to `SCHEMA_SQL` (covers fresh databases).
2. In `openStore`, after `db.exec(SCHEMA_SQL)`, read `PRAGMA table_info(active_timer)`
   and `ALTER TABLE active_timer ADD COLUMN ...` for any of the two that are missing.
   Idempotent: a no-op once the columns exist.

`openStore.replace()` re-runs `db.exec(SCHEMA_SQL)` after loading an imported
snapshot; it must run the same column-ensure step so an imported older DB is upgraded
too.

## Net-duration calculation

New pure function in `src/lib/timer.ts`:

```ts
export function netElapsed(
  startTs: number,
  pausedMs: number,
  pausedAt: number | null,
  now: number,
): number {
  const end = pausedAt ?? now
  return Math.max(0, end - startTs - pausedMs)
}
```

- Running (`pausedAt === null`): ticks as `now - startTs - pausedMs`.
- Paused (`pausedAt !== null`): frozen at `pausedAt - startTs - pausedMs`.
- With `pausedMs = 0, pausedAt = null` it equals today's `elapsedMs`, so the **breast
  timer** (which never pauses) is unaffected.

`elapsedMs` stays for any callers that only need raw wall-clock elapsed.

## Queries (`src/db/queries.ts`)

- `getActiveTimer` — select and return `paused_ms` and `paused_at` on the
  `ActiveTimer` object.
- `startTimer` — on a fresh start, reset `paused_ms = 0, paused_at = NULL` (extend the
  INSERT and the `ON CONFLICT DO UPDATE`).
- `setTimerStart(exec, type, start_ts)` — **new**; updates only `start_ts` (used by
  edit-start so it does not wipe accumulated pauses). `editStart` switches from
  `startTimer` to this.
- `pauseTimer(exec, type, now)` — set `paused_at = now` **only if not already paused**
  (`WHERE type = ? AND paused_at IS NULL`).
- `resumeTimer(exec, type, now)` — `paused_ms = paused_ms + (now - paused_at),
  paused_at = NULL` **only if currently paused** (`WHERE type = ? AND paused_at IS NOT
  NULL`).

## Types (`src/db/types.ts`)

`ActiveTimer` gains `paused_ms: number` and `paused_at: number | null`.

## Hook (`src/state/useActiveTimer.ts`)

`elapsed` is computed with `netElapsed`. When `timer.paused_at != null`, do not run the
1s interval — the value is frozen. When running, tick every second as today.

## UI (`src/components/home/SleepSession.tsx`)

Drive the button off DB state instead of the local `endTs`:

- `paused = timer?.paused_at != null`
- Button:
  - running → label **STOP** → `pauseTimer(db, 'sleep', Date.now())` → `refresh()`
  - paused  → label **RESUME** → `resumeTimer(db, 'sleep', Date.now())` → `refresh()`
- Duration shown via `netElapsed(...)`; frozen while paused.
- **Save**: `end_ts = timer.start_ts + netElapsed(...)`. `start_ts` stays the real clock
  start; `end_ts` becomes start + net sleep so the entry's duration excludes gaps.
  If currently paused, save uses the frozen net value.
- **Cancel** and **external-stop** detection are unchanged (timer → null still means the
  other device committed/cancelled).
- Remove the local `endTs` state and the `'STOPPED'`/`disabled` branch. `clampStartTs`
  now clamps against the effective end (`pausedAt ?? now`) instead of the old `endTs`.

Label decision: **STOP** (running) / **RESUME** (paused), matching the user's wording.

## Testing

- `src/lib/timer.test.ts` — `netElapsed`: running, paused (frozen), multiple
  pause/resume accumulation, clamp at 0 when start is in the future.
- `src/db/queries.test.ts` — `pauseTimer` sets `paused_at` once and is a no-op when
  already paused; `resumeTimer` accumulates `paused_ms` and clears `paused_at`, no-op
  when running; `startTimer` resets both; `setTimerStart` preserves them.
- `src/components/home/SleepSession.test.tsx` — STOP ↔ RESUME toggle; duration frozen
  while paused; Save stores net duration (start + net, excluding the paused gap).
- Migration: an `openStore` test that opens a DB lacking the columns (or asserts the
  `ALTER` is a no-op on a fresh DB) — confirm `getActiveTimer` returns the new fields.

## Out of scope

- Pausing the breast timer (only sleep gets a pause button).
- Displaying individual pause intervals or pause count.
- Any change to how completed `entries` are stored beyond the `end_ts = start + net`
  convention (no new `entries` columns).

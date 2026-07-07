# Nursing (Breast) page — design

**Date:** 2026-07-07
**Status:** Approved, ready for planning

## Motivation

Two pieces of user feedback, tightly coupled:

1. **Tapping a running timer banner should open its page, not stop the timer.** Sleep
   already does this; the breast timer banner currently stops immediately.
2. **Breast needs a dedicated full-screen page** like Sleep, matching the attached
   "NURSING" design — a per-side (L/R) nursing timer.

Today breast is only a small form inside `LogSheet` (`BreastForm.tsx`): start one
timer with a single `side` value, or log manually. The new design tracks time **per
side within one feed** (each of L and R has its own clock; the top shows the sum) and
shows a **"Last"** badge marking which side was used last.

## Design reference

The screenshot shows:
- Header: back arrow, centered title **NURSING**, playful subtitle **#liquidgold**.
- Big **00:00** total with label **Feed duration**.
- Two large circular buttons **L** and **R**, each with its own **00:00** underneath.
- A gold **Last** badge floating over the last-used side.
- Pencil edit affordance (edit start time).
- Instruction: "Tap the L or R button to start the timer. Tap it once again if you
  wish to pause or stop."
- **ENTER TIME MANUALLY** link.
- **Cancel** (ghost) / **Save** (primary) buttons.

## Decisions

- Breast becomes a full-screen page (`BreastSession.tsx`) mirroring `SleepSession.tsx`,
  opened the same way Sleep is (from the quick-log grid, or by tapping the running
  timer banner). The old `BreastForm` sheet is removed.
- **One side runs at a time.** Tapping the running side pauses/stops it; tapping the
  other side commits the current side and switches.
- **Full per-side breakdown is persisted** to history (chosen over aggregate-only).
- Pause/resume-by-tapping, edit-start-time, note, "enter manually", and the
  "stopped on another device" handling all mirror the Sleep page.

## Data model

### `entries` table (new columns)

Add via idempotent `ALTER TABLE ... ADD COLUMN` migration (same pattern as the
`active_timer` pause-columns migration):

- `left_ms INTEGER` — active nursing time on the left. Null for non-breast / legacy rows.
- `right_ms INTEGER` — active nursing time on the right. Null for non-breast / legacy rows.

For a saved breast entry:
- `side` = `'L'` if only left had time, `'R'` if only right, `'both'` if both `> 0`.
- `end_ts = start_ts + left_ms + right_ms` (total active feed time; excludes idle gaps
  between sides).
- `start_ts` = session start (first tap), editable via the pencil.

`Entry` type (`src/db/types.ts`) gains `left_ms: number | null` and
`right_ms: number | null`.

### `active_timer` table (new columns)

Add via the same idempotent migration:

- `left_ms INTEGER NOT NULL DEFAULT 0` — committed left accumulation.
- `right_ms INTEGER NOT NULL DEFAULT 0` — committed right accumulation.
- `running_since INTEGER` — timestamp the currently-running side started; null when
  paused/idle.

Reused columns for breast:
- `start_ts` = session start (set on first tap).
- `side` = the currently-running side (`'L'` or `'R'`), or null when paused/idle.
- `paused_ms` / `paused_at` are unused for breast (stay 0 / null).

Sleep is unchanged: it keeps using `paused_ms` / `paused_at`; the new columns stay at
their defaults (0 / null) for sleep rows.

`ActiveTimer` type gains `left_ms: number`, `right_ms: number`,
`running_since: number | null`.

### `settings`

- `breast_last_side` = `'L'` | `'R'` — written whenever a side starts running. Drives
  the **Last** badge; survives reload and syncs across devices. Read on page open when
  no timer is active.

### Live values (computed in the component / a helper)

```
leftLive  = left_ms  + (side === 'L' && running_since ? now - running_since : 0)
rightLive = right_ms + (side === 'R' && running_since ? now - running_since : 0)
total     = leftLive + rightLive
```

## Timer behavior

Tapping side **X** (`X` ∈ {L, R}):
- If **X is currently running** → pause: commit `now - running_since` into
  `X`'s `_ms`, set `side = null`, `running_since = null`.
- Else (idle, or the other side Y is running):
  - If Y is running, commit `now - running_since` into `Y`'s `_ms` first.
  - Start X: `side = X`, `running_since = now`, and `setSetting('breast_last_side', X)`.
  - If no active_timer row exists yet, INSERT it with `start_ts = now`,
    `left_ms = 0`, `right_ms = 0`.

**Save**: commit any running side, then `insertEntry` with `type: 'breast'`,
`start_ts`, `end_ts = start_ts + left_ms + right_ms`, derived `side`, `left_ms`,
`right_ms`, `note`. Clear the timer.

**Cancel**: confirm ("Discard this nursing session?"), then clear the timer.

**Edit start time**: `setTimerStart` on the breast row, clamped so `start_ts ≤ now`.
Editing start only moves the entry's timestamp; it does not change per-side durations.

**External stop**: if the timer disappears out from under an open page (other
caregiver saved/cancelled), show the same "stopped on another device" notice Sleep uses.

## New queries (`src/db/queries.ts`)

- `startBreastSide(exec, side, now)` — INSERT-or-switch per the behavior above; also
  writes `breast_last_side`.
- `pauseBreastSide(exec, now)` — commit the running side into its `_ms`, set
  `side = null`, `running_since = null`.
- `getActiveTimer` / `startTimer` updated to read/write the new columns.
- Save reuses `insertEntry` (extended `NewEntry` with `left_ms` / `right_ms`) and
  `clearTimer`.

## Components

### `src/components/home/BreastSession.tsx` (new)

Mirrors `SleepSession.tsx` structure and props
(`{ syncSignal, onClose, onCommitted }`). Sections:

- Header: back arrow (`onClose` keeps the timer running), **NURSING**, `#liquidgold`.
- Total **Feed duration** (`formatElapsed(total)`).
- Two circular L/R buttons, each showing its live per-side time; active side visually
  highlighted; **Last** badge on the side equal to `breast_last_side` (when idle).
- Pencil → inline edit of start time (`TimeField`, like Sleep).
- Instruction text.
- **ENTER TIME MANUALLY** → manual mode: `TimeField` for start + **Left (min)** and
  **Right (min)** steppers + note; Save inserts an entry with those per-side ms.
- Cancel / Save buttons.
- "Stopped on another device" notice on external stop.

### Wiring

- `App.tsx`: add `breastOpen` state and `<BreastSession>` render; pass
  `onOpenBreast={() => setBreastOpen(true)}` to `Home`.
- `Home.tsx`: `TimerBanner` `onStop` for a breast timer → `onOpenBreast` (was
  `stopTimer`). `QuickLogGrid` "Breast" → `onOpenBreast` (parallel to Sleep's
  `onOpenSleep`). The now-unused `stopTimer` is removed.
- `LogSheet.tsx` + `BreastForm.tsx`: breast removed from the sheet; `BreastForm.tsx`
  deleted.
- `TimerBanner.tsx`: copy "Tap to stop" → **"Tap to open"** (neither timer stops on
  tap now); banner shows the total feed duration for breast.

### History display

- `entryLabel.ts` breast case: show per-side, e.g. `🤱 Breast · L 5m / R 3m`, or
  `Breast · L · 5m` when only one side was used. Falls back to the existing
  `Breast · <side> · <dur>` for legacy rows with null `left_ms`/`right_ms`.
- `EditEntrySheet`: stays generic (edits start / end / note, as it does for every type
  today) and shows the per-side breakdown read-only in its title via `entryLabel`.
  Per-side field editing is deferred — no entry type has custom edit fields today, and
  adding one only for breast would break that shared pattern.
- `computeDailyTotals`: unaffected — a breast entry still counts as one feed.

## Styling

Add `.breast-page` styles to `theme.css` reusing the sleep-page tokens where possible:
dark canvas, large circular side buttons (active/last states), the gold `Last` pill,
the big total, and the same button row as Sleep.

## Testing

- Timer math helper(s): start/switch/pause accumulation, total = L + R, side
  derivation (`L` / `R` / `both`), `end_ts` computation.
- Queries: `startBreastSide` insert vs. switch, `pauseBreastSide` commit,
  `getActiveTimer` round-trip with new columns, `breast_last_side` setting write.
- Component: tap-to-start, tap-again-to-pause, switch sides, Save inserts the correct
  entry, Cancel confirm, external-stop notice, manual entry.
- `entryLabel` per-side formatting incl. legacy fallback.
- Migration idempotency (running the `ALTER TABLE` twice is a no-op).

## Out of scope

- Simultaneous both-sides timing (design is one side at a time).
- Per-side editing in the edit sheet (edit stays generic: start / end / note).
- Changing bottle/solids feed flows.
- Reworking the Sleep page.

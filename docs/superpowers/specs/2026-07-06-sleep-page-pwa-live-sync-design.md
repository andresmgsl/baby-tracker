# Sleep session page, PWA install, and live sync — design

Date: 2026-07-06

Three independent improvements to BabyLog, driven by real-use feedback:

1. A dedicated full-screen **sleep session page** (start/adjust/stop a sleep with an
   editable start time and a note).
2. A working **PWA install** affordance (the browser's install button wasn't showing
   "by itself").
3. **Live sync** so a second caregiver sees timer start/stop and new entries without
   reloading.

Language: the app UI is English; all new copy stays English, with strings isolated so
localization later is a mechanical change.

---

## Track 1 — Full-screen sleep session page

### Problem

Today `SleepForm` is a small bottom sheet: "Start timer" begins an `active_timer` row,
and the only way to stop is tapping the Home banner, which saves `start_ts → now` with
**no note and no way to correct the start time**. Users routinely realize the baby fell
asleep earlier and want to backdate the start while the timer runs.

### Solution

A new full-screen component `src/components/home/SleepSession.tsx`, rendered as an
overlay from `App.tsx` (new `sleepOpen` boolean state) above the tab content.

**Entry points**

- Tapping **Sleep** in the Home quick-grid opens the page in a *pre-start* state:
  a large **Start** button plus an **Enter manually** link (preserves today's ability
  to log a past sleep via a duration stepper + time field). Pressing **Start** creates
  the `active_timer` row and switches to the *running* view.
- Tapping the Home **timer banner** when the active timer is `sleep` reopens the running
  view. Breast timers keep today's tap-to-stop behavior unchanged.

**Running view** (mirrors the reference mockup)

- Live **Duration** counting up from `active_timer.start_ts` (reuses `useActiveTimer` /
  `elapsedMs`).
- A large circular **Stop** button.
- A **"started at HH:MM"** row with a pencil that opens a time editor. Editing writes the
  new `start_ts` directly to `active_timer` through the existing `startTimer` upsert
  (`ON CONFLICT(type) DO UPDATE`) — **no schema change**. The duration recalculates live
  and the correction survives closing/reopening the page. The start is clamped so it can
  never be in the future.
- A **Note** textarea (held in page-local state until save).
- A bottom action bar: **Cancel** / **Save**.

**Stop / Save semantics**

- **Stop** freezes `end = Date.now()` and stops the live tick. The duration becomes
  static; **Save** becomes the emphasized action. Start time and note remain editable
  after stopping.
- **Save** writes a `sleep` entry (`start_ts → end_ts`, with the note), clears the
  `active_timer` row, and returns to Home. If Save is pressed while still running, it
  uses `now` as `end_ts`.
- **Cancel** discards the session (clears the `active_timer` row), behind a confirm to
  avoid accidental loss of an in-progress sleep.
- **Back arrow (‹)** closes the page but *keeps the timer running* in the background
  (the Home banner remains). An unsaved note draft is lost on back-out — acceptable
  because notes are typically added right before saving, and avoiding note persistence
  keeps `active_timer` schema-free.

**Units / components reused**: `TimeField` (or a lighter time-only input) from
`formKit.tsx`, `Stepper` for the manual-entry duration, `formatElapsed` from `lib/timer`.

### Data flow

- `active_timer.start_ts` is the single source of truth for the start; it is persisted
  and edited in place, so any device reads the corrected value.
- `end_ts` and `note` are page-local until **Save** commits the entry.

### Edge cases

- Start edited to after `now` → clamped to `now` (zero/short duration allowed).
- Timer stopped on another device while this page is open → handled by Track 3
  (notice + close).

---

## Track 2 — PWA install affordance

### Problem

On the user's Android Chrome the install prompt "doesn't show by itself." The repo's
manifest, icons, service-worker registration (`registerType: 'prompt'`), and HTTPS all
look correct, but there is **no in-app install affordance** and nothing captures the
`beforeinstallprompt` event, so the app never surfaces an install path of its own.

### Solution

**New hook** `src/lib/pwaInstall.ts` — `usePwaInstall()`:

- Listens for `beforeinstallprompt`, calls `preventDefault()`, and stashes the event.
- Listens for `appinstalled` to clear the stashed event.
- Detects iOS Safari and whether the app is already running standalone
  (`display-mode: standalone` / `navigator.standalone`).
- Returns `{ canInstall, promptInstall, isInstalled, isIOS }`, where `promptInstall()`
  calls the stashed event's `prompt()`.

**Affordances**

- A **dismissible install banner on Home**, shown only when `canInstall` is true:
  "Install app" triggers the stashed prompt. Dismissal is remembered (localStorage), and
  the banner never shows once installed. This directly addresses "show by itself."
- A permanent **"Install app" row in Settings** as a fallback. On iOS Safari (no
  programmatic prompt) it instead shows instructions: "Tap Share → Add to Home Screen."
  When already installed, it shows an "Installed" state.

**Installability audit**: verify at deploy time that the built `manifest.webmanifest`
and all icon files are actually reachable (HTTP 200) on `baby.abiqum.com`. A 404 on the
manifest or an icon is the usual reason Chrome never fires `beforeinstallprompt`; the
repo config is correct, so this is a verification step, not an expected code change.

---

## Track 3 — Live sync between caregivers (polling)

### Problem

Both caregivers already read/write the same server SQLite DB via `/api/exec`, but each
device only re-queries on its own actions. So when one stops a timer or logs a feed, the
other doesn't see it until a manual reload.

### Solution

A single top-level poller (a `useLiveSync` hook mounted once, e.g. in `App`) that runs
every ~3 seconds **only while `document.visibilityState === 'visible'`**, pauses when the
tab is hidden, and polls immediately on `visibilitychange`/`focus`.

Each tick runs two tiny queries:

1. `getActiveTimer()` — drives the banner and the sleep page.
2. A change marker: `SELECT MAX(updated_at) FROM entries` (and the same over
   `measurements`), combined into a single signature.

The hook tracks the last-seen `(activeTimerSignature, changeMarker)`. When either differs
from what this device last saw, it bumps the shared reload signal so Home (banner,
timeline, totals), History, and any open sleep-session page re-query. Because the signal
only changes when the data actually changed, idle polling causes no re-renders/remounts.

**Sleep page interaction**: if the sleep page is open and a poll finds the `sleep`
`active_timer` gone (stopped by the other caregiver), the page shows a brief "Sleep
stopped on another device" notice and closes.

**Cost**: two small SELECTs every 3 s per visible tab, only for signed-in users. No
server or nginx changes; reuses the existing `/api/exec` endpoint.

### Wiring

- Extend/reuse the existing `refreshKey` mechanism in `App.tsx`: the poller bumps it on
  detected change to reload Home/History. The sleep-session overlay reads the active
  timer fresh (its own `useActiveTimer` refreshed on the same signal).
- Keep polling logic in one hook so the interval, visibility handling, and signature
  comparison live in a single testable unit.

---

## Testing

- **Sleep page**: unit-test the running-view state machine (start → running → stop →
  save; cancel; start-time edit clamps to now; manual entry path). Reuse the existing
  Vitest + jsdom setup and the query-layer test helpers.
- **PWA install**: unit-test `usePwaInstall` — `beforeinstallprompt` captured →
  `canInstall` true; `appinstalled` → false; iOS detection path returns instructions
  mode.
- **Live sync**: unit-test `useLiveSync` signature comparison (no change → no signal
  bump; changed marker or timer → bump) and visibility gating (hidden → no polling).
- **Manual**: two browsers signed in — start/stop a timer in one, confirm the other
  updates within ~3 s without reload; install banner appears on Android Chrome and the
  prompt installs the app.

## Out of scope

- Real-time push (SSE/WebSocket) — polling chosen; SSE remains a future upgrade.
- Localizing the whole app to Spanish — new copy stays English.
- Persisting an in-progress sleep note across app close (would need an `active_timer`
  schema change).

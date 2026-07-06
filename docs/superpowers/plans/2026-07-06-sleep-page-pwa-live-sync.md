# Sleep Session Page, PWA Install, and Live Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen sleep session page (editable start time + note), an in-app PWA install affordance, and polling-based live sync so a second caregiver sees timer/entry changes without reloading.

**Architecture:** Three independent tracks against the existing React + SQL-over-HTTP app. The sleep page is a full-screen overlay driven by the existing `active_timer` row (start time edited in place via the `startTimer` upsert — no schema change). PWA install is a hook over `beforeinstallprompt` plus UI. Live sync is one visibility-gated poller that bumps the app's existing `refreshKey`.

**Tech Stack:** React 18 + TypeScript, Vite, vite-plugin-pwa, Vitest + @testing-library/react + jsdom, server-side SQLite via `/api/exec`.

## Global Constraints

- **Language:** all new UI copy is English. Isolate strings so localization stays mechanical.
- **No DB schema changes.** `active_timer` stays `(type, start_ts, side)`; the deployed Pi has live data.
- **Design system:** dark neobrutalist. Use theme tokens from `src/styles/theme.css` (`--ink`, `--paper`, `--panel`, `--c-sleep: #5d7cff`, `--bw`, `--bw-heavy`, `--shadow`, `--radius`, `--font-mono`). Adopt the mockup's *layout/behavior*, not its soft palette.
- **Test running:** `npx vitest run <path>` for one file; `npm test` for all. Tests must not hit the network — use `makeTestExecutor()` with `DbProvider`.
- **Commits:** conventional style (`feat:`, `fix:`, `test:`), frequent, one per task minimum.

---

## File Structure

**Track 1 — Sleep page**
- Create `src/components/home/SleepSession.tsx` — full-screen sleep session (pre-start / running / manual states).
- Create `src/components/home/SleepSession.test.tsx` — integration tests.
- Modify `src/lib/timer.ts` — add pure `clampStartTs` helper.
- Modify `src/lib/timer.test.ts` — test `clampStartTs`.
- Modify `src/App.tsx` — `sleepOpen` state + overlay wiring.
- Modify `src/components/home/Home.tsx` — Sleep tap opens page; sleep banner reopens page.
- Modify `src/components/home/LogSheet.tsx` — drop `sleep` from the sheet forms.
- Delete `src/components/home/forms/SleepForm.tsx` — replaced by the page.

**Track 2 — PWA install**
- Create `src/lib/pwaInstall.ts` — `usePwaInstall` hook.
- Create `src/lib/pwaInstall.test.tsx` — hook tests.
- Create `src/components/home/InstallBanner.tsx` — dismissible Home banner.
- Create `src/components/settings/InstallSection.tsx` — Settings row + iOS instructions.
- Modify `src/components/home/Home.tsx` — render `InstallBanner`.
- Modify `src/components/settings/Settings.tsx` — render `InstallSection`.

**Track 3 — Live sync**
- Modify `src/db/queries.ts` — add `latestChangeMarker`.
- Modify `src/db/queries.test.ts` — test `latestChangeMarker` (create if absent).
- Create `src/state/useLiveSync.ts` — visibility-gated poller.
- Create `src/state/useLiveSync.test.tsx` — poller tests.
- Modify `src/App.tsx` — mount `useLiveSync`, pass sync signal to sleep overlay.
- Modify `src/components/home/SleepSession.tsx` — react to sync signal + external-stop notice.

**Track 1/2 shared styling**
- Modify `src/styles/theme.css` — sleep page, install banner, install section styles.

---

## Track 1 — Full-screen sleep session page

### Task 1: `clampStartTs` pure helper

**Files:**
- Modify: `src/lib/timer.ts`
- Test: `src/lib/timer.test.ts`

**Interfaces:**
- Produces: `clampStartTs(desired: number, now: number, endTs: number | null): number` — the start timestamp clamped so it never exceeds `endTs` (when the timer is stopped) or `now` (while running).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/timer.test.ts`:

```ts
import { clampStartTs } from './timer'

describe('clampStartTs', () => {
  it('caps a future start at now while running', () => {
    expect(clampStartTs(5_000, 4_000, null)).toBe(4_000)
  })
  it('leaves a past start untouched while running', () => {
    expect(clampStartTs(3_000, 4_000, null)).toBe(3_000)
  })
  it('caps start at the frozen end time when stopped', () => {
    expect(clampStartTs(9_000, 10_000, 6_000)).toBe(6_000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/timer.test.ts`
Expected: FAIL — `clampStartTs is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/timer.ts`:

```ts
/** Start time can never sit after the end of the interval (now, or a frozen end). */
export function clampStartTs(desired: number, now: number, endTs: number | null): number {
  return Math.min(desired, endTs ?? now)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/timer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timer.ts src/lib/timer.test.ts
git commit -m "feat: add clampStartTs helper for editable sleep start"
```

---

### Task 2: `SleepSession` component

**Files:**
- Create: `src/components/home/SleepSession.tsx`
- Test: `src/components/home/SleepSession.test.tsx`

**Interfaces:**
- Consumes: `useActiveTimer()` → `{ timer, elapsed, refresh }`; `startTimer`, `insertEntry`, `clearTimer` from `db/queries`; `formatElapsed`, `elapsedMs`, `clampStartTs` from `lib/timer`; `Stepper`, `TimeField` from `forms/formKit`.
- Produces: `SleepSession` React component with props
  `{ syncSignal: number; onClose: () => void; onCommitted: () => void }`.
  `onClose` = back arrow (keep timer running). `onCommitted` = after Save/Cancel/external-stop acknowledge (timer cleared; caller should refresh + close).

- [ ] **Step 1: Write the failing test**

Create `src/components/home/SleepSession.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { DbProvider } from '../../db/client'
import { makeTestExecutor } from '../../db/testExecutor'
import { getActiveTimer, listEntries, startTimer } from '../../db/queries'
import { SleepSession } from './SleepSession'
import type { WorkerExecutor } from '../../db/client'

let exec: WorkerExecutor
beforeEach(async () => {
  const base = await makeTestExecutor()
  exec = Object.assign(base, {
    exportBytes: async () => new Uint8Array(),
    importBytes: async () => {},
  }) as WorkerExecutor
})
afterEach(() => vi.restoreAllMocks())

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
const renderPage = (props: Partial<Parameters<typeof SleepSession>[0]> = {}) =>
  render(createElement(DbProvider, { executor: exec, children:
    createElement(SleepSession, {
      syncSignal: 0, onClose: () => {}, onCommitted: () => {}, ...props,
    }) }))

describe('SleepSession', () => {
  it('starts a timer from the pre-start view', async () => {
    renderPage()
    await flush()
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    await flush()
    expect(await getActiveTimer(exec)).not.toBeNull()
    expect(screen.getByText(/duration/i)).toBeTruthy()
  })

  it('saves a running sleep as an entry and clears the timer', async () => {
    await startTimer(exec, { type: 'sleep', start_ts: 1_000, side: null })
    const onCommitted = vi.fn()
    renderPage({ onCommitted })
    await flush()
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await flush()
    const entries = await listEntries(exec, { type: 'sleep' })
    expect(entries).toHaveLength(1)
    expect(entries[0].start_ts).toBe(1_000)
    expect(await getActiveTimer(exec)).toBeNull()
    expect(onCommitted).toHaveBeenCalled()
  })

  it('discards the session on cancel confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await startTimer(exec, { type: 'sleep', start_ts: 1_000, side: null })
    renderPage()
    await flush()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await flush()
    expect(await getActiveTimer(exec)).toBeNull()
    expect(await listEntries(exec, { type: 'sleep' })).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/home/SleepSession.test.tsx`
Expected: FAIL — cannot resolve `./SleepSession`.

- [ ] **Step 3: Implement the component**

Create `src/components/home/SleepSession.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { useDb } from '../../db/client'
import { useActiveTimer } from '../../state/useActiveTimer'
import { insertEntry, startTimer, clearTimer } from '../../db/queries'
import { formatElapsed, elapsedMs, clampStartTs } from '../../lib/timer'
import { Stepper, TimeField } from './forms/formKit'

const EMPTY = {
  side: null, amount_ml: null, milk_type: null, food: null, diaper_kind: null,
  med_name: null, med_dose: null, photo_id: null,
} as const

export interface SleepSessionProps {
  syncSignal: number
  onClose: () => void       // back arrow — keep the timer running
  onCommitted: () => void   // saved / cancelled / external-stop acked
}

export function SleepSession({ syncSignal, onClose, onCommitted }: SleepSessionProps) {
  const db = useDb()
  const { timer, elapsed, refresh } = useActiveTimer()
  const running = timer?.type === 'sleep'

  const [manual, setManual] = useState(false)
  const [minutes, setMinutes] = useState(45)
  const [manualTs, setManualTs] = useState(Date.now())
  const [note, setNote] = useState('')
  const [endTs, setEndTs] = useState<number | null>(null)
  const [editingStart, setEditingStart] = useState(false)
  const [externalStopped, setExternalStopped] = useState(false)

  const committing = useRef(false)
  const wasRunning = useRef(false)

  // Live-sync: re-read the timer whenever the app's sync signal changes.
  useEffect(() => { void refresh() }, [syncSignal, refresh])

  // Detect the other caregiver stopping the timer out from under us.
  useEffect(() => {
    if (wasRunning.current && !timer && !committing.current) setExternalStopped(true)
    if (running) wasRunning.current = true
  }, [timer, running])

  async function start() {
    await startTimer(db, { type: 'sleep', start_ts: Date.now(), side: null })
    await refresh()
  }

  async function editStart(ts: number) {
    if (!timer) return
    const clamped = clampStartTs(ts, Date.now(), endTs)
    await startTimer(db, { type: 'sleep', start_ts: clamped, side: timer.side })
    await refresh()
    setEditingStart(false)
  }

  async function save() {
    if (!timer) return
    committing.current = true
    await insertEntry(db, {
      type: 'sleep', start_ts: timer.start_ts, end_ts: endTs ?? Date.now(),
      note: note.trim() || null, ...EMPTY,
    })
    await clearTimer(db, 'sleep')
    onCommitted()
  }

  async function cancel() {
    if (!window.confirm('Discard this sleep session?')) return
    committing.current = true
    await clearTimer(db, 'sleep')
    onCommitted()
  }

  async function saveManual() {
    await insertEntry(db, {
      type: 'sleep', start_ts: manualTs, end_ts: manualTs + minutes * 60_000,
      note: note.trim() || null, ...EMPTY,
    })
    onCommitted()
  }

  const duration = endTs != null && timer ? elapsedMs(timer.start_ts, endTs) : elapsed

  if (externalStopped) {
    return (
      <div className="sleep-page">
        <div className="sleep-notice">
          <p>This sleep was stopped on another device.</p>
          <button className="btn-primary" onClick={onCommitted}>OK</button>
        </div>
      </div>
    )
  }

  return (
    <div className="sleep-page">
      <header className="sleep-head">
        <button className="sleep-back" aria-label="Back" onClick={onClose}>‹</button>
        <span>SLEEP</span>
        <span className="sleep-head-spacer" />
      </header>

      {!running && !manual && (
        <div className="sleep-prestart">
          <button className="btn-start" onClick={start}>Start</button>
          <button className="btn-link" onClick={() => setManual(true)}>Enter manually</button>
        </div>
      )}

      {!running && manual && (
        <div className="sleep-manual">
          <Stepper label="duration" value={minutes} step={5} min={5} unit="min" onChange={setMinutes} />
          <TimeField value={manualTs} onChange={setManualTs} />
          <textarea className="sleep-note" placeholder="Your note (optional)"
            value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="sleep-actions">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={saveManual}>Save</button>
          </div>
        </div>
      )}

      {running && (
        <div className="sleep-running">
          <div className="sleep-duration">{formatElapsed(duration)}</div>
          <div className="sleep-duration-label">Duration</div>

          <button className={`sleep-stop ${endTs != null ? 'stopped' : ''}`}
            disabled={endTs != null} onClick={() => setEndTs(Date.now())}>
            {endTs != null ? 'STOPPED' : 'STOP'}
          </button>

          <div className="sleep-startrow">
            <span>started at</span>
            {editingStart ? (
              <TimeField value={timer.start_ts} onChange={editStart} />
            ) : (
              <>
                <b>{new Date(timer.start_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b>
                <button className="sleep-edit" aria-label="Edit start time"
                  onClick={() => setEditingStart(true)}>✎</button>
              </>
            )}
          </div>

          <textarea className="sleep-note" placeholder="Your note (optional)"
            value={note} onChange={(e) => setNote(e.target.value)} />

          <div className="sleep-actions">
            <button className="btn-ghost" onClick={cancel}>Cancel</button>
            <button className="btn-primary" onClick={save}>Save</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/home/SleepSession.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/home/SleepSession.tsx src/components/home/SleepSession.test.tsx
git commit -m "feat: full-screen sleep session page with editable start and note"
```

---

### Task 3: Wire the sleep page into App and Home

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/home/Home.tsx`
- Modify: `src/components/home/LogSheet.tsx`
- Delete: `src/components/home/forms/SleepForm.tsx`

**Interfaces:**
- Consumes: `SleepSession` (Task 2).
- Produces: Home gains prop `onOpenSleep: () => void`. App holds `sleepOpen` state and renders the overlay.

- [ ] **Step 1: Update Home to route sleep to the page**

In `src/components/home/Home.tsx`:

Change the component signature and props:

```tsx
export function Home({
  onLog, onSelectEntry, onOpenSleep,
}: {
  onLog: (t: LogTarget) => void
  onSelectEntry: (e: Entry) => void
  onOpenSleep: () => void
}) {
```

Replace the `onLog` passed to `QuickLogGrid` so a sleep tap opens the page instead of the sheet:

```tsx
<QuickLogGrid
  lasts={lasts}
  onLog={(t) => (t === 'sleep' ? onOpenSleep() : onLog(t))}
  now={now}
/>
```

Change the banner so a sleep timer reopens the page while breast still stops inline:

```tsx
{timer && (
  <TimerBanner
    timer={timer}
    elapsed={elapsed}
    onStop={timer.type === 'sleep' ? onOpenSleep : stopTimer}
  />
)}
```

- [ ] **Step 2: Update App to own the overlay**

In `src/App.tsx`, add state and imports:

```tsx
import { SleepSession } from './components/home/SleepSession'
```

Add near the other `useState` calls:

```tsx
const [sleepOpen, setSleepOpen] = useState(false)
```

Pass `onOpenSleep` to Home:

```tsx
{tab === 'home' && (
  <Home
    key={refreshKey}
    onLog={setTarget}
    onSelectEntry={setEditing}
    onOpenSleep={() => setSleepOpen(true)}
  />
)}
```

Render the overlay just before the closing `</div>` of `.app` (after `EditEntrySheet`):

```tsx
{sleepOpen && (
  <SleepSession
    syncSignal={refreshKey}
    onClose={() => setSleepOpen(false)}
    onCommitted={() => { setSleepOpen(false); setRefreshKey((k) => k + 1) }}
  />
)}
```

- [ ] **Step 3: Remove sleep from the bottom sheet**

In `src/components/home/LogSheet.tsx`, delete the `SleepForm` import and remove `sleep: SleepForm` from the `FORMS` map:

```tsx
const FORMS: Record<string, (p: FormProps) => JSX.Element> = {
  breast: BreastForm, bottle: BottleForm, solids: SolidsForm,
  diaper: DiaperForm, meds: MedsForm, note: NoteForm,
}
```

Then delete the now-unused file:

```bash
git rm src/components/home/forms/SleepForm.tsx
```

- [ ] **Step 4: Verify the suite still passes and types are clean**

Run: `npm test` and `npx tsc --noEmit`
Expected: all tests PASS; no type errors. (If `Home.test.tsx` constructs `<Home>` directly, add `onOpenSleep={() => {}}` to that render.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: route sleep to the full-screen session page"
```

---

### Task 4: Sleep page styling

**Files:**
- Modify: `src/styles/theme.css`

**Interfaces:** none (CSS only; class names produced by Task 2).

- [ ] **Step 1: Add styles**

Append to `src/styles/theme.css`:

```css
/* ---------- sleep session page ---------- */
.sleep-page {
  position: fixed; inset: 0; z-index: 50;
  background: var(--bg); color: var(--paper);
  display: flex; flex-direction: column;
  padding: env(safe-area-inset-top) 18px env(safe-area-inset-bottom);
}
.sleep-head {
  display: grid; grid-template-columns: 40px 1fr 40px; align-items: center;
  padding: 14px 0; font: 700 12px var(--font-mono);
  letter-spacing: 0.18em; text-align: center;
}
.sleep-back {
  background: var(--panel); color: var(--paper);
  border: var(--bw) solid var(--line); border-radius: var(--radius);
  width: 36px; height: 36px; font-size: 22px; line-height: 1;
}
.sleep-prestart, .sleep-manual, .sleep-running {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  gap: 16px; padding-top: 24px;
}
.sleep-duration {
  font: 700 64px/1 var(--font-mono); color: var(--paper);
  margin-top: 32px; font-variant-numeric: tabular-nums;
}
.sleep-duration-label {
  font: 700 10px var(--font-mono); letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--muted);
}
.sleep-stop {
  margin: 24px 0; width: 150px; height: 150px; border-radius: 50%;
  background: var(--panel); color: var(--c-sleep);
  border: var(--bw-heavy) solid var(--c-sleep);
  font: 700 22px var(--font-mono); letter-spacing: 0.08em;
  box-shadow: var(--shadow);
}
.sleep-stop:active { transform: translate(4px, 4px); box-shadow: 0 0 0 var(--ink); }
.sleep-stop.stopped { color: var(--muted); border-color: var(--line); box-shadow: none; }
.sleep-startrow {
  display: flex; align-items: center; gap: 10px;
  font: 500 14px var(--font-sans); color: var(--muted);
}
.sleep-startrow b { color: var(--paper); font: 700 16px var(--font-mono); }
.sleep-edit {
  background: var(--c-diaper); color: var(--ink);
  border: var(--bw) solid var(--ink); border-radius: var(--radius);
  width: 34px; height: 34px; font-size: 15px;
}
.sleep-note {
  width: 100%; min-height: 72px; resize: vertical;
  background: var(--panel); color: var(--paper);
  border: var(--bw) solid var(--line); border-radius: var(--radius);
  padding: 10px; font: inherit;
}
.sleep-actions {
  margin-top: auto; width: 100%; display: flex; gap: 12px; padding: 16px 0;
}
.sleep-actions button { flex: 1; padding: 14px; }
.sleep-notice {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 18px; text-align: center;
}
```

Note: if `.btn-start`, `.btn-link`, `.btn-primary`, `.btn-ghost` are not already defined globally, verify they exist (they are used by existing forms). Grep before adding: `grep -n "btn-start\|btn-primary\|btn-ghost" src/styles/theme.css`. If any are missing, add minimal equivalents using the same tokens.

- [ ] **Step 2: Visual check**

Run: `npm run dev`, open the app, tap Sleep, Start, edit the start time, add a note, Stop, Save. Confirm layout matches the mockup's structure and the entry appears in the timeline.

- [ ] **Step 3: Commit**

```bash
git add src/styles/theme.css
git commit -m "style: sleep session page layout"
```

---

## Track 2 — PWA install affordance

### Task 5: `usePwaInstall` hook

**Files:**
- Create: `src/lib/pwaInstall.ts`
- Test: `src/lib/pwaInstall.test.tsx`

**Interfaces:**
- Produces: `usePwaInstall(): { canInstall: boolean; isIOS: boolean; isInstalled: boolean; promptInstall: () => Promise<void> }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pwaInstall.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePwaInstall } from './pwaInstall'

afterEach(() => vi.restoreAllMocks())

function fireBeforeInstall() {
  const evt: any = new Event('beforeinstallprompt')
  evt.prompt = vi.fn().mockResolvedValue(undefined)
  evt.userChoice = Promise.resolve({ outcome: 'accepted' })
  act(() => { window.dispatchEvent(evt) })
  return evt
}

describe('usePwaInstall', () => {
  it('becomes installable after beforeinstallprompt and calls prompt', async () => {
    const { result } = renderHook(() => usePwaInstall())
    expect(result.current.canInstall).toBe(false)
    const evt = fireBeforeInstall()
    expect(result.current.canInstall).toBe(true)
    await act(async () => { await result.current.promptInstall() })
    expect(evt.prompt).toHaveBeenCalled()
  })

  it('clears installability after appinstalled', () => {
    const { result } = renderHook(() => usePwaInstall())
    fireBeforeInstall()
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(result.current.canInstall).toBe(false)
    expect(result.current.isInstalled).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pwaInstall.test.tsx`
Expected: FAIL — cannot resolve `./pwaInstall`.

- [ ] **Step 3: Implement**

Create `src/lib/pwaInstall.ts`:

```ts
import { useEffect, useState, useCallback } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true
}

export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(detectStandalone())
  const isIOS = detectIOS()

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => { setDeferred(null); setIsInstalled(true) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
  }, [deferred])

  return { canInstall: deferred !== null, isIOS, isInstalled, promptInstall }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/pwaInstall.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pwaInstall.ts src/lib/pwaInstall.test.tsx
git commit -m "feat: usePwaInstall hook capturing beforeinstallprompt"
```

---

### Task 6: Install banner + Settings section + styling

**Files:**
- Create: `src/components/home/InstallBanner.tsx`
- Create: `src/components/settings/InstallSection.tsx`
- Modify: `src/components/home/Home.tsx`
- Modify: `src/components/settings/Settings.tsx`
- Modify: `src/styles/theme.css`

**Interfaces:**
- Consumes: `usePwaInstall` (Task 5).
- Produces: `InstallBanner` and `InstallSection` components (no props).

- [ ] **Step 1: Create the dismissible Home banner**

Create `src/components/home/InstallBanner.tsx`:

```tsx
import { useState } from 'react'
import { usePwaInstall } from '../../lib/pwaInstall'

const DISMISS_KEY = 'bt_install_dismissed'

export function InstallBanner() {
  const { canInstall, promptInstall } = usePwaInstall()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')

  if (!canInstall || dismissed) return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="install-banner">
      <span>Install BabyLog for one-tap access.</span>
      <div className="install-banner-actions">
        <button className="btn-primary" onClick={() => void promptInstall()}>Install</button>
        <button className="btn-link" aria-label="Dismiss" onClick={dismiss}>✕</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Render the banner on Home**

In `src/components/home/Home.tsx`, import and render it at the top of the returned tree, above the timer banner:

```tsx
import { InstallBanner } from './InstallBanner'
```

```tsx
return (
  <div>
    <InstallBanner />
    {timer && (
      <TimerBanner ... />
    )}
    ...
```

- [ ] **Step 3: Create the Settings section**

Create `src/components/settings/InstallSection.tsx`:

```tsx
import { usePwaInstall } from '../../lib/pwaInstall'

export function InstallSection() {
  const { canInstall, isIOS, isInstalled, promptInstall } = usePwaInstall()

  if (isInstalled) {
    return (
      <section className="card-section">
        <h3>Install</h3>
        <p className="muted">App is installed. ✓</p>
      </section>
    )
  }

  return (
    <section className="card-section">
      <h3>Install</h3>
      {canInstall ? (
        <button className="btn-primary" onClick={() => void promptInstall()}>Install app</button>
      ) : isIOS ? (
        <p className="muted">Tap the Share button, then “Add to Home Screen”.</p>
      ) : (
        <p className="muted">Open this site in Chrome or Edge to install, or use your browser’s “Install app” menu.</p>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Render the section in Settings**

In `src/components/settings/Settings.tsx`, import and render `InstallSection` (place it after `BackupSection`):

```tsx
import { InstallSection } from './InstallSection'
```

```tsx
<BackupSection />
<InstallSection />
<AccountSection />
```

- [ ] **Step 5: Add banner styling**

Append to `src/styles/theme.css`:

```css
/* ---------- install affordances ---------- */
.install-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  background: var(--c-meds); color: var(--ink);
  border: var(--bw-heavy) solid var(--ink); border-radius: var(--radius);
  box-shadow: var(--shadow); padding: 10px 12px; margin-bottom: 12px;
  font: 700 13px var(--font-sans);
}
.install-banner-actions { display: flex; align-items: center; gap: 8px; }
.install-banner .btn-primary { padding: 8px 12px; }
.install-banner .btn-link { color: var(--ink); font-size: 16px; }
```

- [ ] **Step 6: Verify**

Run: `npm test` and `npx tsc --noEmit`
Expected: PASS, no type errors. On Android Chrome (deployed HTTPS build) confirm the banner appears and installs; in Settings confirm the fallback/iOS copy renders.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: in-app install banner and settings section"
```

---

## Track 3 — Live sync (polling)

### Task 7: `latestChangeMarker` query

**Files:**
- Modify: `src/db/queries.ts`
- Test: `src/db/queries.test.ts`

**Interfaces:**
- Produces: `latestChangeMarker(exec: SqlExecutor): Promise<number>` — the max `updated_at` across `entries` and `measurements` (0 when both empty).

- [ ] **Step 1: Write the failing test**

Add to `src/db/queries.test.ts` (match the file's existing import/setup style — it already imports from `./queries` and builds a test executor):

```ts
import { latestChangeMarker } from './queries'

describe('latestChangeMarker', () => {
  it('is 0 with no data and rises after an insert', async () => {
    const exec = await makeTestExecutor()
    expect(await latestChangeMarker(exec)).toBe(0)
    await insertEntry(exec, {
      type: 'diaper', start_ts: 1_000, end_ts: null, side: null, amount_ml: null,
      milk_type: null, food: null, diaper_kind: 'wet', med_name: null, med_dose: null,
      note: null, photo_id: null,
    })
    expect(await latestChangeMarker(exec)).toBeGreaterThan(0)
  })
})
```

If `src/db/queries.test.ts` does not exist, create it with the standard header:

```ts
import { describe, it, expect } from 'vitest'
import { makeTestExecutor } from './testExecutor'
import { insertEntry, latestChangeMarker } from './queries'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/queries.test.ts`
Expected: FAIL — `latestChangeMarker is not a function`.

- [ ] **Step 3: Implement**

Append to `src/db/queries.ts`:

```ts
/** Max updated_at across mutable tables; a cheap signature for "did anything change". */
export async function latestChangeMarker(exec: SqlExecutor): Promise<number> {
  const rows = await exec.exec(
    `SELECT MAX(m) AS marker FROM (
       SELECT MAX(updated_at) AS m FROM entries
       UNION ALL
       SELECT MAX(updated_at) AS m FROM measurements
     )`,
  )
  return (rows[0]?.marker as number | null) ?? 0
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/queries.ts src/db/queries.test.ts
git commit -m "feat: latestChangeMarker query for live-sync polling"
```

---

### Task 8: `useLiveSync` poller

**Files:**
- Create: `src/state/useLiveSync.ts`
- Test: `src/state/useLiveSync.test.tsx`

**Interfaces:**
- Consumes: `getActiveTimer`, `latestChangeMarker` (Task 7).
- Produces: `useLiveSync(onChange: () => void, intervalMs?: number): void` — polls while the tab is visible; calls `onChange` when the active-timer signature or change marker differs from the last poll. Establishes a baseline on mount without firing `onChange`.

- [ ] **Step 1: Write the failing test**

Create `src/state/useLiveSync.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { DbProvider } from '../db/client'
import { makeTestExecutor } from '../db/testExecutor'
import { insertEntry } from '../db/queries'
import { useLiveSync } from './useLiveSync'
import type { WorkerExecutor } from '../db/client'

let exec: WorkerExecutor
beforeEach(async () => {
  vi.useFakeTimers()
  const base = await makeTestExecutor()
  exec = Object.assign(base, {
    exportBytes: async () => new Uint8Array(),
    importBytes: async () => {},
  }) as WorkerExecutor
})
afterEach(() => vi.useRealTimers())

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DbProvider, { executor: exec, children })
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

describe('useLiveSync', () => {
  it('does not fire on the baseline poll', async () => {
    const onChange = vi.fn()
    renderHook(() => useLiveSync(onChange, 3000), { wrapper })
    await settle()
    await act(async () => { vi.advanceTimersByTime(3000); await Promise.resolve() })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('fires when the change marker advances', async () => {
    const onChange = vi.fn()
    renderHook(() => useLiveSync(onChange, 3000), { wrapper })
    await settle()
    await insertEntry(exec, {
      type: 'diaper', start_ts: 1_000, end_ts: null, side: null, amount_ml: null,
      milk_type: null, food: null, diaper_kind: 'wet', med_name: null, med_dose: null,
      note: null, photo_id: null,
    })
    await act(async () => { vi.advanceTimersByTime(3000); await Promise.resolve(); await Promise.resolve() })
    expect(onChange).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/state/useLiveSync.test.tsx`
Expected: FAIL — cannot resolve `./useLiveSync`.

- [ ] **Step 3: Implement**

Create `src/state/useLiveSync.ts`:

```ts
import { useEffect, useRef } from 'react'
import { useDb } from '../db/client'
import { getActiveTimer, latestChangeMarker } from '../db/queries'
import type { ActiveTimer } from '../db/types'

const sigOf = (t: ActiveTimer | null) => (t ? `${t.type}:${t.start_ts}:${t.side}` : '')

export function useLiveSync(onChange: () => void, intervalMs = 3000): void {
  const db = useDb()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const lastSig = useRef<string | null>(null)
  const lastMarker = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      const [timer, marker] = await Promise.all([getActiveTimer(db), latestChangeMarker(db)])
      if (cancelled) return
      const sig = sigOf(timer)
      const first = lastSig.current === null
      const changed = !first && (sig !== lastSig.current || marker !== lastMarker.current)
      lastSig.current = sig
      lastMarker.current = marker
      if (changed) onChangeRef.current()
    }

    let id: ReturnType<typeof setInterval> | null = null
    const start = () => { if (id === null) id = setInterval(() => void poll(), intervalMs) }
    const stop = () => { if (id !== null) { clearInterval(id); id = null } }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') { void poll(); start() } else { stop() }
    }

    void poll()               // establish baseline
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)

    return () => {
      cancelled = true
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
    }
  }, [db, intervalMs])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/state/useLiveSync.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/state/useLiveSync.ts src/state/useLiveSync.test.tsx
git commit -m "feat: useLiveSync visibility-gated poller"
```

---

### Task 9: Mount live sync in App

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useLiveSync` (Task 8). Bumps the existing `refreshKey`, which already remounts Home/History and feeds `syncSignal` to the sleep overlay (Task 3).

- [ ] **Step 1: Wire the hook**

In `src/App.tsx`, import and call it inside the component (before the return):

```tsx
import { useLiveSync } from './state/useLiveSync'
```

```tsx
useLiveSync(() => setRefreshKey((k) => k + 1))
```

Because `SleepSession` already receives `syncSignal={refreshKey}` (Task 3, Step 2) and re-reads the timer on change, and shows the external-stop notice when the timer disappears, no further sleep-page wiring is needed.

- [ ] **Step 2: Verify**

Run: `npm test` and `npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 3: Manual two-device check**

Run the dev server (or deploy). Sign in on two browsers. In one, start a sleep timer and stop it; confirm the other's Home banner appears/updates within ~3 s with no manual reload. Log a bottle in one; confirm it appears in the other's timeline/totals within ~3 s.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: enable live sync polling across caregivers"
```

---

## Track final — Deploy-time PWA installability verification

### Task 10: Verify manifest reachability on the deployed host

**Files:** none (operational verification; may amend `deploy/DEPLOY.md`).

- [ ] **Step 1: Build and check the manifest locally**

Run: `npm run build` then `npx vite preview` and load the app. In DevTools → Application → Manifest, confirm the manifest parses and all icons load. Confirm a service worker is registered and active.

- [ ] **Step 2: Verify on the deployed host after deploy**

After deploying, from a machine run:

```bash
curl -sI https://baby.abiqum.com/manifest.webmanifest
curl -sI https://baby.abiqum.com/icon-192.png
curl -sI https://baby.abiqum.com/icon-512.png
```

Expected: each returns `200` with a sensible `Content-Type` (`application/manifest+json` for the manifest). A 404 here is the usual reason Chrome never fires `beforeinstallprompt`.

- [ ] **Step 3: Confirm installability on Android Chrome**

On the phone, load `https://baby.abiqum.com`, sign in, and confirm the Install banner appears (or Chrome's menu shows "Install app"). Install and launch from the home screen; confirm it opens standalone.

- [ ] **Step 4: Record any config fix**

If step 2 shows a 404 (e.g. nginx not serving the hashed manifest or icons under `/`), add the fix to `deploy/nginx-baby.abiqum.com.conf` and note it in `deploy/DEPLOY.md`, then commit:

```bash
git add deploy/
git commit -m "fix: ensure PWA manifest and icons are served for installability"
```

---

## Self-Review

**Spec coverage:**
- Track 1 full-screen page, editable start (no schema change), note, Stop-freezes-then-Save, Cancel/Back, manual entry → Tasks 1–4. ✓
- Track 2 `usePwaInstall`, Home banner + Settings row + iOS hint, installability audit → Tasks 5, 6, 10. ✓
- Track 3 visibility-gated poller, active-timer + `MAX(updated_at)` marker, reload on change, external-stop notice → Tasks 7, 8, 9 (+ Task 2 notice, Task 3 signal wiring). ✓
- Testing section (sleep state machine, install hook, live-sync signature, manual two-device) → covered per task. ✓
- Out-of-scope items (SSE, full localization, note persistence across close) → respected. ✓

**Placeholder scan:** no TBD/TODO; all steps carry concrete code and commands.

**Type consistency:** `clampStartTs(desired, now, endTs)`, `latestChangeMarker(exec)`, `usePwaInstall()` return shape, and `SleepSession` props (`syncSignal`, `onClose`, `onCommitted`) are used identically across producing and consuming tasks. `ActiveTimer` signature fields (`type`, `start_ts`, `side`) match `db/types.ts`. `insertEntry` payloads include every `NewEntry` column via the `EMPTY` spread.

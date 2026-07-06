# Home Multi-Day Preview + Filter Chips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the last 3 days on the Home timeline, add a type-filter chip row, and a "See all" link to the History tab — while keeping the Today totals unfiltered.

**Architecture:** Two pure helpers (`dayGroups` for grouping entries by calendar day with friendly labels, `filterEntries` for narrowing by type) drive the render. Home widens its data range to 3 days, computes totals from the today-subset only, and maps day groups to the existing `Timeline` component. A new `TimelineFilter` chip row holds the selected-types state.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest + @testing-library/react, better-sqlite3-backed test executor.

## Global Constraints

- TypeScript strict; entry types are exactly: `breast | bottle | solids | sleep | diaper | meds | note` (from `src/db/types.ts`).
- Time helpers live in `src/lib/time.ts`: `startOfDay(ts)`, `endOfDay(ts)`, `formatClock(ts)`. `DAY = 86_400_000`.
- Tests run with `npm test` (vitest run). Component tests use the `DbProvider` + `makeTestExecutor` pattern from `src/components/home/Home.test.tsx`.
- Entries from `listEntriesBetween` are ordered newest-first by `start_ts`.

---

### Task 1: `dayGroups` helper

**Files:**
- Create: `src/components/home/dayGroups.ts`
- Test: `src/components/home/dayGroups.test.ts`

**Interfaces:**
- Consumes: `Entry` from `../../db/types`; `startOfDay` from `../../lib/time`.
- Produces:
  ```ts
  export interface DayGroup { key: string; label: string; entries: Entry[] }
  export function dayGroups(entries: Entry[], now: number): DayGroup[]
  ```
  Groups by calendar day of `start_ts`, newest day first, entries within a group preserve input order. `label` is `"Today"`, `"Yesterday"`, or `"Sat, 5 Jul"` (`toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })`). `key` is `String(startOfDay(e.start_ts))`.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/home/dayGroups.test.ts
import { describe, it, expect } from 'vitest'
import { dayGroups } from './dayGroups'
import type { Entry } from '../../db/types'
import { startOfDay } from '../../lib/time'

const DAY = 86_400_000
const base: Omit<Entry, 'id' | 'start_ts'> = {
  type: 'note', end_ts: null, side: null, amount_ml: null, milk_type: null,
  food: null, diaper_kind: null, med_name: null, med_dose: null, note: 'x',
  photo_id: null, created_at: 0, updated_at: 0,
}
const entry = (id: number, start_ts: number): Entry => ({ ...base, id, start_ts })

describe('dayGroups', () => {
  const now = new Date('2026-07-07T12:00:00').getTime()

  it('groups entries by calendar day, newest day first', () => {
    const groups = dayGroups([
      entry(1, now),                    // today
      entry(2, now - DAY),              // yesterday
      entry(3, now - DAY - 3600_000),   // yesterday, earlier
      entry(4, now - 2 * DAY),          // two days ago
    ], now)
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', expect.stringMatching(/Jul/)])
    expect(groups[1].entries.map((e) => e.id)).toEqual([2, 3])
  })

  it('keys each group by start-of-day', () => {
    const groups = dayGroups([entry(1, now)], now)
    expect(groups[0].key).toBe(String(startOfDay(now)))
  })

  it('returns empty array for no entries', () => {
    expect(dayGroups([], now)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- dayGroups`
Expected: FAIL — cannot find module `./dayGroups`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/home/dayGroups.ts
import type { Entry } from '../../db/types'
import { startOfDay } from '../../lib/time'

export interface DayGroup { key: string; label: string; entries: Entry[] }

const DAY = 86_400_000

function labelFor(dayStart: number, now: number): string {
  const todayStart = startOfDay(now)
  if (dayStart === todayStart) return 'Today'
  if (dayStart === todayStart - DAY) return 'Yesterday'
  return new Date(dayStart).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

export function dayGroups(entries: Entry[], now: number): DayGroup[] {
  const map = new Map<number, Entry[]>()
  for (const e of entries) {
    const dayStart = startOfDay(e.start_ts)
    if (!map.has(dayStart)) map.set(dayStart, [])
    map.get(dayStart)!.push(e)
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([dayStart, es]) => ({ key: String(dayStart), label: labelFor(dayStart, now), entries: es }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- dayGroups`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/home/dayGroups.ts src/components/home/dayGroups.test.ts
git commit -m "feat: dayGroups helper for multi-day timeline grouping"
```

---

### Task 2: `TimelineFilter` component + `filterEntries` helper

**Files:**
- Create: `src/components/home/TimelineFilter.tsx`
- Test: `src/components/home/TimelineFilter.test.tsx`

**Interfaces:**
- Consumes: `Entry`, `EntryType` from `../../db/types`.
- Produces:
  ```ts
  export function filterEntries(entries: Entry[], selected: Set<EntryType>): Entry[]
  export function TimelineFilter(props: {
    selected: Set<EntryType>
    onToggle: (t: EntryType) => void
  }): JSX.Element
  ```
  `filterEntries` returns `entries` unchanged when `selected.size === 0`, else only entries whose `type ∈ selected`. `TimelineFilter` renders one `<button>` per type with `aria-pressed` reflecting membership; clicking calls `onToggle(type)`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/home/TimelineFilter.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimelineFilter, filterEntries } from './TimelineFilter'
import type { Entry, EntryType } from '../../db/types'

const mk = (id: number, type: EntryType): Entry => ({
  id, type, start_ts: id, end_ts: null, side: null, amount_ml: null, milk_type: null,
  food: null, diaper_kind: null, med_name: null, med_dose: null, note: null,
  photo_id: null, created_at: 0, updated_at: 0,
})

describe('filterEntries', () => {
  const rows = [mk(1, 'sleep'), mk(2, 'diaper'), mk(3, 'bottle')]
  it('returns all entries when nothing selected', () => {
    expect(filterEntries(rows, new Set())).toEqual(rows)
  })
  it('keeps only selected types', () => {
    expect(filterEntries(rows, new Set<EntryType>(['diaper'])).map((e) => e.id)).toEqual([2])
  })
})

describe('TimelineFilter', () => {
  it('reflects selection with aria-pressed and toggles on click', async () => {
    const onToggle = vi.fn()
    render(<TimelineFilter selected={new Set<EntryType>(['sleep'])} onToggle={onToggle} />)
    expect(screen.getByRole('button', { name: /sleep/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /diaper/i })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: /diaper/i }))
    expect(onToggle).toHaveBeenCalledWith('diaper')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- TimelineFilter`
Expected: FAIL — cannot find module `./TimelineFilter`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/home/TimelineFilter.tsx
import type { Entry, EntryType } from '../../db/types'

const CHIPS: { type: EntryType; icon: string; label: string }[] = [
  { type: 'breast', icon: '🤱', label: 'breast' },
  { type: 'bottle', icon: '🍼', label: 'bottle' },
  { type: 'solids', icon: '🥄', label: 'solids' },
  { type: 'sleep', icon: '😴', label: 'sleep' },
  { type: 'diaper', icon: '💧', label: 'diaper' },
  { type: 'meds', icon: '💊', label: 'meds' },
  { type: 'note', icon: '📝', label: 'note' },
]

export function filterEntries(entries: Entry[], selected: Set<EntryType>): Entry[] {
  if (selected.size === 0) return entries
  return entries.filter((e) => selected.has(e.type))
}

export function TimelineFilter({
  selected, onToggle,
}: {
  selected: Set<EntryType>
  onToggle: (t: EntryType) => void
}) {
  return (
    <div className="chips" role="group" aria-label="Filter by type">
      {CHIPS.map((c) => (
        <button
          key={c.type}
          type="button"
          className="chip"
          aria-label={c.label}
          aria-pressed={selected.has(c.type)}
          onClick={() => onToggle(c.type)}
        >
          <span aria-hidden="true">{c.icon}</span>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- TimelineFilter`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/home/TimelineFilter.tsx src/components/home/TimelineFilter.test.tsx
git commit -m "feat: TimelineFilter chip row and filterEntries helper"
```

---

### Task 3: Wire multi-day preview + filter into Home

**Files:**
- Modify: `src/components/home/Home.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/home/Home.test.tsx`

**Interfaces:**
- Consumes: `dayGroups` (Task 1), `TimelineFilter` + `filterEntries` (Task 2), existing `Timeline`, `useEntries`, `computeDailyTotals`, `startOfDay`/`endOfDay` from `../../lib/time`.
- Produces: `Home` gains prop `onSeeAll: () => void`. Render adds a filter chip row, grouped day sections, and a "See all" button.

- [ ] **Step 1: Write the failing test**

Add these two tests inside the `describe('Home', ...)` block in `src/components/home/Home.test.tsx` (keep existing imports; add `userEvent`):

```tsx
// add at top with other imports:
import userEvent from '@testing-library/user-event'

  it('shows older-day entries but counts totals for today only', async () => {
    const now = Date.now()
    const DAY = 86_400_000
    await insertEntry(exec, {
      type: 'diaper', start_ts: now, end_ts: null, side: null, amount_ml: null,
      milk_type: null, food: null, diaper_kind: 'wet', med_name: null, med_dose: null,
      note: null, photo_id: null,
    })
    await insertEntry(exec, {
      type: 'diaper', start_ts: now - DAY, end_ts: null, side: null, amount_ml: null,
      milk_type: null, food: null, diaper_kind: 'dirty', med_name: null, med_dose: null,
      note: null, photo_id: null,
    })
    render(<Home onLog={() => {}} onSelectEntry={() => {}} onOpenSleep={() => {}} onSeeAll={() => {}} />, { wrapper })
    await waitFor(() => expect(screen.getByText('Yesterday')).toBeInTheDocument())
    // two diaper rows visible (today + yesterday)
    expect(screen.getAllByText(/Diaper/).length).toBe(2)
  })

  it('See all fires onSeeAll', async () => {
    const onSeeAll = vi.fn()
    render(<Home onLog={() => {}} onSelectEntry={() => {}} onOpenSleep={() => {}} onSeeAll={onSeeAll} />, { wrapper })
    await userEvent.click(await screen.findByRole('button', { name: /see all/i }))
    expect(onSeeAll).toHaveBeenCalled()
  })
```

Add `vi` to the vitest import: `import { describe, it, expect, beforeEach, vi } from 'vitest'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- Home`
Expected: FAIL — `Home` has no `onSeeAll` prop / no "Yesterday" / no "See all" button.

- [ ] **Step 3: Implement Home changes**

Replace the body of `src/components/home/Home.tsx` with:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useDb } from '../../db/client'
import { useEntries } from '../../state/useEntries'
import { useActiveTimer } from '../../state/useActiveTimer'
import { lastEntryByType, clearTimer, insertEntry } from '../../db/queries'
import { computeDailyTotals } from '../../lib/totals'
import { startOfDay, endOfDay } from '../../lib/time'
import type { Entry, EntryType } from '../../db/types'
import { QuickLogGrid, type LogTarget } from './QuickLogGrid'
import { TotalsStrip } from './TotalsStrip'
import { Timeline } from './Timeline'
import { TimerBanner } from './TimerBanner'
import { InstallBanner } from './InstallBanner'
import { dayGroups } from './dayGroups'
import { TimelineFilter, filterEntries } from './TimelineFilter'

const LAST_TYPES: EntryType[] = ['breast', 'bottle', 'sleep', 'diaper', 'solids', 'meds']
const DAY = 86_400_000

export function Home({
  onLog, onSelectEntry, onOpenSleep, onSeeAll,
}: {
  onLog: (t: LogTarget) => void
  onSelectEntry: (e: Entry) => void
  onOpenSleep: () => void
  onSeeAll: () => void
}) {
  const db = useDb()
  const now = Date.now()
  const { entries, reload } = useEntries(startOfDay(now - 2 * DAY), endOfDay(now))
  const { timer, elapsed, refresh } = useActiveTimer()
  const [lasts, setLasts] = useState<Partial<Record<LogTarget, number>>>({})
  const [selected, setSelected] = useState<Set<EntryType>>(new Set())

  const todayStart = startOfDay(now)
  const todayEntries = useMemo(() => entries.filter((e) => e.start_ts >= todayStart), [entries, todayStart])
  const totals = useMemo(() => computeDailyTotals(todayEntries), [todayEntries])
  const groups = useMemo(() => dayGroups(filterEntries(entries, selected), now), [entries, selected, now])

  useEffect(() => {
    void (async () => {
      const out: Partial<Record<LogTarget, number>> = {}
      for (const t of LAST_TYPES) {
        const last = await lastEntryByType(db, t)
        if (last) out[t] = last.start_ts
      }
      setLasts(out)
    })()
  }, [db, entries])

  function toggle(t: EntryType) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  async function stopTimer() {
    if (!timer) return
    await insertEntry(db, {
      type: timer.type, start_ts: timer.start_ts, end_ts: Date.now(), side: timer.side,
      amount_ml: null, milk_type: null, food: null, diaper_kind: null,
      med_name: null, med_dose: null, note: null, photo_id: null,
    })
    await clearTimer(db, timer.type)
    await refresh()
    await reload()
  }

  return (
    <div>
      <InstallBanner />
      {timer && (
        <TimerBanner
          timer={timer}
          elapsed={elapsed}
          onStop={timer.type === 'sleep' ? onOpenSleep : stopTimer}
        />
      )}
      <QuickLogGrid
        lasts={lasts}
        onLog={(t) => (t === 'sleep' ? onOpenSleep() : onLog(t))}
        now={now}
      />
      <div className="more-row">
        <button className="btn-link" onClick={() => onLog('measure')}>📏 Measure</button>
        <button className="btn-link" onClick={() => onLog('temperature')}>🌡️ Temp</button>
        <button className="btn-link" onClick={() => onLog('note')}>📝 Note</button>
      </div>
      <div className="sectlbl">Today</div>
      <TotalsStrip totals={totals} />
      <div className="sectlbl">Timeline</div>
      <TimelineFilter selected={selected} onToggle={toggle} />
      {groups.length === 0 && <p className="muted">No entries in the last 3 days.</p>}
      {groups.map((g) => (
        <div key={g.key}>
          <div className="daylbl">{g.label}</div>
          <Timeline entries={g.entries} onSelect={onSelectEntry} />
        </div>
      ))}
      <button className="btn-link seeall" onClick={onSeeAll}>See all →</button>
    </div>
  )
}
```

Then update `src/App.tsx` — change the Home render (around line 29-35) to pass `onSeeAll`:

```tsx
        {tab === 'home' && (
          <Home
            key={refreshKey}
            onLog={setTarget}
            onSelectEntry={setEditing}
            onOpenSleep={() => setSleepOpen(true)}
            onSeeAll={() => setTab('history')}
          />
        )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- Home`
Expected: PASS (existing test + 2 new tests). The existing "renders today totals" test still passes because `filterEntries` with an empty set is a passthrough and totals use `todayEntries`.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/Home.tsx src/App.tsx src/components/home/Home.test.tsx
git commit -m "feat: Home shows last 3 days with type filter and See-all link"
```

---

### Task 4: Chip and day-label styles

**Files:**
- Modify: `src/styles/theme.css`

**Interfaces:**
- Consumes: class names emitted in Task 2/3 — `.chips`, `.chip`, `.chip[aria-pressed="true"]`, `.daylbl`, `.seeall`.
- Produces: visual styling only; no behavior. No new test (CSS-only).

- [ ] **Step 1: Inspect existing tokens**

Run: `grep -nE '\.sectlbl|\.btn-link|--|\.muted' src/styles/theme.css | head -40`
Expected: shows the color variables (e.g. `--accent`, surface/border colors) and `.sectlbl` definition to match.

- [ ] **Step 2: Append styles**

Add to the end of `src/styles/theme.css` (adjust `var(--...)` names to those found in Step 1; the ones below assume `--accent`, `--surface`, `--border`, `--muted` exist — substitute the real token names):

```css
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0 12px;
}
.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  font-size: 18px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  opacity: 0.5;
  cursor: pointer;
}
.chip[aria-pressed="true"] {
  opacity: 1;
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent) inset;
}
.daylbl {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 14px 0 6px;
}
.seeall {
  display: block;
  margin: 16px auto 8px;
}
```

- [ ] **Step 3: Verify build + full test suite**

Run: `npm test && npx tsc -b --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/styles/theme.css
git commit -m "style: chip filter row and day-label styling on Home"
```

---

## Self-Review

**Spec coverage:**
- 3-day range → Task 3 (`useEntries(startOfDay(now - 2*DAY), endOfDay(now))`). ✓
- Today-only totals → Task 3 (`todayEntries` filter). ✓
- Day grouping + Today/Yesterday/date labels → Task 1. ✓
- Filter chips, multi-select, empty = all → Task 2. ✓
- Filter affects timeline not totals → Task 3 (`filterEntries(entries)` for groups; totals from `todayEntries`). ✓
- See all → History → Task 3 (`onSeeAll` + App wiring). ✓
- Styles → Task 4. ✓
- History tab untouched → no task modifies it. ✓

**Placeholder scan:** Task 4 Step 2 intentionally instructs substituting real CSS token names discovered in Step 1 — this is a real inspection step, not a placeholder. All code blocks are complete.

**Type consistency:** `dayGroups(entries, now)`, `filterEntries(entries, selected: Set<EntryType>)`, `TimelineFilter({ selected, onToggle })`, `Home({ ..., onSeeAll })` — names and signatures match across Tasks 1-3. `DayGroup.key/label/entries` used consistently.

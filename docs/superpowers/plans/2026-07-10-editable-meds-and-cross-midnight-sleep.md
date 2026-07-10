# Editable Meds & Cross-Midnight Sleep Totals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit a med's name/dose after logging it, and count the post-midnight portion of a cross-midnight sleep toward the new day's total.

**Architecture:** Two independent changes. (1) `computeDailyTotals` gains an explicit `[dayStart, dayEnd]` window and counts sleep as the *overlap* with that window instead of dumping the whole session on its start day; `Home` passes today's window and the full loaded entries. (2) `EditEntrySheet` renders editable Name/Dose inputs for `meds` entries and includes them in the save patch.

**Tech Stack:** React 18 + TypeScript, Vitest + @testing-library/react. Tests run with `npm test` (vitest run). A real in-memory test DB is provided by `makeTestApi()` from `src/db/testApi`.

## Global Constraints

- Test runner: `npx vitest run <path>` for a single file; `npm test` runs all.
- `DailyTotals` shape stays `{ feeds: number; diapers: number; sleepMs: number }` (`src/db/types.ts:47`) — do not change it.
- Follow existing test conventions: unit tests import the function directly; component tests use `makeTestApi().db` + `DbProvider` and assert against DB reads, not mocks.
- Existing sleep semantics preserved: ongoing sleeps (`end_ts == null`) never count toward totals.

---

### Task 1: Clip sleep totals to a day window

**Files:**
- Modify: `src/lib/totals.ts` (whole file)
- Modify: `src/lib/totals.test.ts` (existing tests call the old 1-arg signature — must be updated)
- Modify: `src/components/home/Home.tsx:36-38` (caller)
- Test: `src/components/home/Home.test.tsx` (add one cross-midnight case)

**Interfaces:**
- Produces: `computeDailyTotals(entries: Entry[], dayStart: number, dayEnd: number): DailyTotals`
  - `feeds` = count of entries with `type ∈ {breast, bottle, solids}` and `dayStart <= start_ts <= dayEnd`.
  - `diapers` = count of entries with `type === 'diaper'` and `dayStart <= start_ts <= dayEnd`.
  - `sleepMs` = sum over `type === 'sleep' && end_ts != null` of `max(0, min(end_ts, dayEnd) - max(start_ts, dayStart))`.
- Consumes (in Home): `startOfDay`, `endOfDay` from `src/lib/time.ts` (already imported at `Home.tsx:7`).

- [ ] **Step 1: Update the failing unit tests to the new signature**

Replace the entire body of `src/lib/totals.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest'
import { computeDailyTotals } from './totals'
import type { Entry } from '../db/types'

const base = {
  baby_id: 1, end_ts: null, side: null, amount_ml: null, milk_type: null, food: null,
  diaper_kind: null, med_name: null, med_dose: null, note: null, photo_id: null,
  left_ms: null, right_ms: null, created_at: 0, updated_at: 0,
}
const entry = (id: number, type: Entry['type'], extra: Partial<Entry> = {}): Entry =>
  ({ id, type, start_ts: id * 1000, ...base, ...extra })

const HOUR = 3_600_000
const DAY = 86_400_000
// A fixed "today" window at an epoch day boundary (UTC midnight) for arithmetic clarity.
const dayStart = 1_000 * DAY // some day boundary
const dayEnd = dayStart + DAY - 1

describe('computeDailyTotals', () => {
  it('counts feeds and diapers by start_ts within the window and sums completed sleep', () => {
    const entries: Entry[] = [
      entry(1, 'breast', { start_ts: dayStart + HOUR, end_ts: dayStart + HOUR + 18 * 60_000 }),
      entry(2, 'bottle', { start_ts: dayStart + 2 * HOUR }),
      entry(3, 'solids', { start_ts: dayStart + 3 * HOUR }),
      entry(4, 'diaper', { start_ts: dayStart + HOUR, diaper_kind: 'wet' }),
      entry(5, 'diaper', { start_ts: dayStart + 2 * HOUR, diaper_kind: 'dirty' }),
      entry(6, 'sleep', { start_ts: dayStart + HOUR, end_ts: dayStart + HOUR + 50 * 60_000 }),
      entry(7, 'sleep', { start_ts: dayStart + HOUR, end_ts: null }), // in-progress, ignored
      entry(8, 'note', { start_ts: dayStart + HOUR }),
    ]
    expect(computeDailyTotals(entries, dayStart, dayEnd)).toEqual({
      feeds: 3,
      diapers: 2,
      sleepMs: 50 * 60_000,
    })
  })

  it('counts only the in-window portion of a sleep that crosses into the next day', () => {
    // Sleep 10pm today -> 3am tomorrow, relative to a day that ends at dayEnd.
    const sleepStart = dayEnd - 2 * HOUR + 1 // ~2h before midnight
    const sleepEnd = dayStart + DAY + 3 * HOUR // 3h into the next day
    const s: Entry[] = [entry(1, 'sleep', { start_ts: sleepStart, end_ts: sleepEnd })]

    // Today's window gets the ~2h before midnight.
    expect(computeDailyTotals(s, dayStart, dayEnd).sleepMs).toBe(2 * HOUR)
    // The next day's window gets the 3h after midnight.
    const nextStart = dayStart + DAY
    const nextEnd = nextStart + DAY - 1
    expect(computeDailyTotals(s, nextStart, nextEnd).sleepMs).toBe(3 * HOUR)
  })

  it('excludes a sleep entirely outside the window', () => {
    const s: Entry[] = [entry(1, 'sleep', { start_ts: dayStart - 5 * HOUR, end_ts: dayStart - 4 * HOUR })]
    expect(computeDailyTotals(s, dayStart, dayEnd).sleepMs).toBe(0)
  })

  it('handles an empty window', () => {
    expect(computeDailyTotals([], dayStart, dayEnd)).toEqual({ feeds: 0, diapers: 0, sleepMs: 0 })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/totals.test.ts`
Expected: FAIL — the current `computeDailyTotals` ignores the extra args and attributes the whole cross-midnight session to its start day, so the cross-midnight case gets `5*HOUR`/`0` instead of `2*HOUR`/`3*HOUR`.

- [ ] **Step 3: Implement the windowed overlap logic**

Replace the entire contents of `src/lib/totals.ts` with:

```typescript
import type { Entry, DailyTotals } from '../db/types'

const FEED_TYPES = new Set(['breast', 'bottle', 'solids'])

export function computeDailyTotals(entries: Entry[], dayStart: number, dayEnd: number): DailyTotals {
  let feeds = 0
  let diapers = 0
  let sleepMs = 0
  for (const e of entries) {
    if (e.type === 'sleep' && e.end_ts != null) {
      // Count only the portion of the session that falls inside [dayStart, dayEnd].
      sleepMs += Math.max(0, Math.min(e.end_ts, dayEnd) - Math.max(e.start_ts, dayStart))
      continue
    }
    // Point events belong to the day they started on.
    if (e.start_ts < dayStart || e.start_ts > dayEnd) continue
    if (FEED_TYPES.has(e.type)) feeds++
    else if (e.type === 'diaper') diapers++
  }
  return { feeds, diapers, sleepMs }
}
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `npx vitest run src/lib/totals.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Update the Home caller**

In `src/components/home/Home.tsx`, replace lines 36-38:

```typescript
  const todayStart = startOfDay(now)
  const todayEntries = useMemo(() => entries.filter((e) => e.start_ts >= todayStart), [entries, todayStart])
  const totals = useMemo(() => computeDailyTotals(todayEntries), [todayEntries])
```

with:

```typescript
  const todayStart = startOfDay(now)
  const totals = useMemo(
    () => computeDailyTotals(entries, todayStart, endOfDay(now)),
    [entries, todayStart, now],
  )
```

(`endOfDay` is already imported from `../../lib/time` at `Home.tsx:7`. Confirm `todayEntries` has no other references — `grep -n "todayEntries" src/components/home/Home.tsx` should return nothing after this edit.)

- [ ] **Step 6: Add a cross-midnight integration test to Home.test.tsx**

Insert this test inside the `describe('Home', ...)` block in `src/components/home/Home.test.tsx` (e.g. after the existing "shows older-day entries" test at line 47):

```typescript
  it('counts the post-midnight portion of a sleep that started yesterday', async () => {
    const now = Date.now()
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
    const HOUR = 3_600_000
    // Sleep from 2h before midnight to 1h after midnight (into today).
    await insertEntry(exec, {
      type: 'sleep', start_ts: todayStart.getTime() - 2 * HOUR, end_ts: todayStart.getTime() + HOUR,
      side: null, amount_ml: null, milk_type: null, food: null, diaper_kind: null,
      med_name: null, med_dose: null, note: null, photo_id: null,
    })
    render(<Home onLog={() => {}} onSelectEntry={() => {}} onOpenSleep={() => {}} onOpenBreast={() => {}} onSeeAll={() => {}} />, { wrapper })
    // Today's sleep total shows the 1h that fell after midnight, formatted as "1h 0m".
    await waitFor(() =>
      expect(screen.getByText('sleep').previousElementSibling).toHaveTextContent('1h'),
    )
  })
```

Note: `formatDuration` renders `3_600_000` ms as `1h 0m` (verify the exact string with `grep -n "formatDuration" src/lib/time.ts` if the assertion fails, and adjust the matched substring — `toHaveTextContent('1h')` matches a substring so it is robust).

- [ ] **Step 7: Run the Home tests and the full suite**

Run: `npx vitest run src/components/home/Home.test.tsx src/lib/totals.test.ts`
Expected: PASS. Then `npm test` — Expected: all tests PASS.

- [ ] **Step 8: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/totals.ts src/lib/totals.test.ts src/components/home/Home.tsx src/components/home/Home.test.tsx
git commit -m "fix(totals): count cross-midnight sleep toward the new day"
```

---

### Task 2: Edit meds name & dose in the edit sheet

**Files:**
- Modify: `src/components/history/EditEntrySheet.tsx`
- Test: `src/components/history/EditEntrySheet.test.tsx` (create)

**Interfaces:**
- Consumes: `updateEntry(db, id, patch)` and `type NewEntry` from `src/db/queries` (already imported at `EditEntrySheet.tsx:3`); `insertEntry`, `listEntries` for the test.
- Produces: no new exports. When `entry.type === 'meds'`, `save()` includes `med_name` and `med_dose` (trimmed, `|| null`) in the patch.

- [ ] **Step 1: Write the failing component test**

Create `src/components/history/EditEntrySheet.test.tsx`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { DbProvider, type Api } from '../../db/client'
import { makeTestApi } from '../../db/testApi'
import { insertEntry, listEntries } from '../../db/queries'
import { EditEntrySheet } from './EditEntrySheet'
import type { Entry } from '../../db/types'

let exec: Api
beforeEach(() => { exec = makeTestApi().db })
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DbProvider, { executor: exec, children })

describe('EditEntrySheet — meds', () => {
  it('edits the med name and dose and persists them', async () => {
    const id = await insertEntry(exec, {
      type: 'meds', start_ts: Date.now(), end_ts: null, side: null, amount_ml: null,
      milk_type: null, food: null, diaper_kind: null, med_name: 'Vitamin D',
      med_dose: '1 drop', note: null, photo_id: null,
    })
    const rows = await listEntries(exec, { type: 'meds' })
    const entry = rows.find((r) => r.id === id) as Entry

    render(<EditEntrySheet entry={entry} onClose={() => {}} onChanged={() => {}} />, { wrapper })

    const dose = await screen.findByPlaceholderText(/dose/i)
    await userEvent.clear(dose)
    await userEvent.type(dose, '2 drops')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const after = await listEntries(exec, { type: 'meds' })
    const updated = after.find((r) => r.id === id) as Entry
    expect(updated.med_dose).toBe('2 drops')
    expect(updated.med_name).toBe('Vitamin D')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/history/EditEntrySheet.test.tsx`
Expected: FAIL — no element matches placeholder `/dose/i` (the sheet has no dose input yet).

- [ ] **Step 3: Add meds fields and include them in the save patch**

In `src/components/history/EditEntrySheet.tsx`, inside `EditBody`, add local state after the existing `note` state (currently `EditEntrySheet.tsx:30`):

```typescript
  const [medName, setMedName] = useState(entry.med_name ?? '')
  const [medDose, setMedDose] = useState(entry.med_dose ?? '')
```

In `save()`, after the line `const patch: Partial<NewEntry> = { start_ts: start, end_ts: end, note: note.trim() || null }` (currently `EditEntrySheet.tsx:35`), add:

```typescript
    if (entry.type === 'meds') {
      patch.med_name = medName.trim() || null
      patch.med_dose = medDose.trim() || null
    }
```

In the returned JSX, add the two inputs immediately before the `<textarea ... placeholder="Note" ...>` (currently `EditEntrySheet.tsx:73`):

```tsx
        {entry.type === 'meds' && (
          <>
            <div className="sectlbl">Name</div>
            <input className="text-input" placeholder="Name (e.g. Vitamin D)" value={medName} onChange={(e) => setMedName(e.target.value)} />
            <div className="sectlbl">Dose</div>
            <input className="text-input" placeholder="Dose (e.g. 1 drop)" value={medDose} onChange={(e) => setMedDose(e.target.value)} />
          </>
        )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/history/EditEntrySheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc -b && npm test`
Expected: no type errors; all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/history/EditEntrySheet.tsx src/components/history/EditEntrySheet.test.tsx
git commit -m "feat(edit): allow editing meds name and dose after logging"
```

---

## Self-Review

**Spec coverage:**
- Editable meds (name + dose) → Task 2. ✓
- `computeDailyTotals(entries, dayStart, dayEnd)` with overlap for sleep, start-day counting for feeds/diapers → Task 1, Steps 1–4. ✓
- Home passes full `entries` + today's window, drops `todayEntries` → Task 1, Step 5. ✓
- Tests: cross-midnight clip, within-day, outside-window, ongoing-ignored, feeds/diapers windowing → Task 1 Step 1; meds edit persistence → Task 2 Step 1. ✓
- Out of scope (ongoing sleeps, other type-specific fields, non-today per-day totals) → untouched. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `computeDailyTotals(entries, dayStart, dayEnd)` used identically in totals, Home, and tests. `DailyTotals` unchanged. `updateEntry(db, id, patch)` and `Partial<NewEntry>` match `queries.ts`. Meds patch keys (`med_name`, `med_dose`) match `Entry`/`NewEntry`. ✓

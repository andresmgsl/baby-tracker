# Baby Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first, installable PWA for tracking one baby's feeds, sleep, diapers, solids, meds, growth measurements, notes, and photos — with timer-based and manual logging, daily totals, growth charts, and file-based backup/export.

**Architecture:** React + TypeScript SPA built with Vite, four bottom-tab screens. All data lives in a real SQLite database (SQLite-WASM) persisted to OPFS, accessed from a Web Worker so the UI thread stays responsive and OPFS sync access is legal. All SQL goes through an async `SqlExecutor` interface: production wires it to the worker; tests wire it to an in-memory `better-sqlite3`, so every typed query function is unit-testable in Node without OPFS. Pure logic (durations, totals, age, unit conversions, timer elapsed) lives in dependency-free modules tested first. Always dark mode.

**Tech Stack:** React 18, TypeScript 5, Vite 6, vite-plugin-pwa, `@sqlite.org/sqlite-wasm` (browser/OPFS), `better-sqlite3` (test executor only), Vitest + React Testing Library + jsdom, plain CSS with CSS variables.

## Global Constraints

- Node `>=22` (development/test runtime).
- React `^18`, TypeScript `^5`, Vite `^6`.
- Database is SQLite only. Browser: `@sqlite.org/sqlite-wasm` persisted to OPFS, run inside a Web Worker. Tests: `better-sqlite3` in-memory. Both implement the same `SqlExecutor` interface defined in Task 5.
- All SQL query logic lives in `src/db/queries.ts` as pure async functions taking a `SqlExecutor` — never embed SQL in React components or in the worker.
- Timestamps are epoch milliseconds (integer) everywhere. Durations are always derived (`end_ts - start_ts`), never stored.
- Measurements are stored in canonical units: weight in **grams**, length (height/head) in **millimeters**, temperature in **°C**. Display conversion happens only in the UI via `src/lib/units.ts`.
- Always dark theme. No light theme, no theme toggle.
- No backend, no network calls, no accounts. The app must function fully offline.
- Test commands: `npm test` runs Vitest once (`vitest run`). Use `npx vitest run <path>` for a single file.
- Commit after every task's final step. Use conventional-commit prefixes (`feat:`, `test:`, `chore:`).

---

## File Structure

```
package.json, tsconfig.json, tsconfig.node.json, vite.config.ts, index.html, .gitignore
src/
  main.tsx                  App entry, mounts <App/>
  App.tsx                   Tab router shell + active tab state
  styles/theme.css          Dark theme CSS variables + base/reset + shared classes
  lib/
    time.ts                 formatClock, formatDuration, formatAgo, ageLabel, startOfDay, endOfDay
    units.ts                gToKg, gToLb, mmToCm, mmToIn, cToF + parse/format helpers
    totals.ts               computeDailyTotals(entries, dayStart, dayEnd)
    timer.ts                elapsedMs(startTs, now), formatElapsed
  db/
    types.ts                Entry, Measurement, Photo, Setting, ActiveTimer, EntryType, etc.
    schema.ts               SCHEMA_SQL string (CREATE TABLE statements)
    executor.ts             SqlExecutor interface + Row type
    queries.ts              insertEntry, listEntries, listEntriesForDay, updateEntry,
                            deleteEntry, insertMeasurement, listMeasurements, deleteMeasurement,
                            getSetting, setSetting, startTimer, getActiveTimer, clearTimer,
                            insertPhoto, getPhoto, exportDb/importDb helpers
    testExecutor.ts         makeTestExecutor() -> SqlExecutor backed by better-sqlite3 (test only)
    worker.ts               Web Worker: hosts sqlite-wasm + OPFS, handles exec/transaction/export/import messages
    client.ts               makeWorkerExecutor() -> SqlExecutor that talks to worker; plus DbProvider/useDb
  state/
    useActiveTimer.ts       hook: live elapsed for the running timer
  components/
    BottomTabs.tsx          4-tab bar
    home/
      Home.tsx              composes grid + totals + timeline + banner + sheet
      QuickLogGrid.tsx
      TotalsStrip.tsx
      Timeline.tsx
      TimerBanner.tsx
      LogSheet.tsx          slide-up sheet container, dispatches to a form by type
      forms/{BreastForm,BottleForm,SleepForm,SolidsForm,DiaperForm,MedsForm,NoteForm,MeasureForm,TemperatureForm}.tsx
    history/History.tsx
    growth/{Growth.tsx,LineChart.tsx}
    settings/{Settings.tsx,ProfileSection.tsx,UnitsSection.tsx,BackupSection.tsx,ButtonsSection.tsx}
test setup: src/test/setup.ts (RTL/jsdom matchers)
```

---

## Task 1: Project scaffold, dark theme, and tab shell

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`
- Create: `src/main.tsx`, `src/App.tsx`, `src/styles/theme.css`
- Create: `src/components/BottomTabs.tsx`
- Create: `src/test/setup.ts`
- Test: `src/components/BottomTabs.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `App` (default export React component) rendering a `BottomTabs` bar and the active tab's placeholder; `BottomTabs` props `{ active: TabId; onChange: (t: TabId) => void }` where `type TabId = 'home' | 'history' | 'growth' | 'settings'`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "baby-tracker",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@sqlite.org/sqlite-wasm": "^3.46.1-build3"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/better-sqlite3": "^7.6.11",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "better-sqlite3": "^11.3.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.5.4",
    "vite": "^6.0.0",
    "vite-plugin-pwa": "^0.20.5",
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: Create TypeScript and Vite config**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

`vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // sqlite-wasm + OPFS require cross-origin isolation headers in dev.
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

- [ ] **Step 3: Create `index.html`, test setup, and theme CSS**

`index.html`:
```html
<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0f1115" />
    <title>Baby Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
```

`src/styles/theme.css`:
```css
:root {
  --bg: #0f1115;
  --surface: #1a1d24;
  --surface-2: #23262e;
  --text: #e8eaed;
  --muted: #9aa0aa;
  --accent: #2d6cdf;
  --green: #27ae60;
  --danger: #e05260;
  --radius: 14px;
}
* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, system-ui, sans-serif;
  -webkit-tap-highlight-color: transparent;
}
.app { display: flex; flex-direction: column; height: 100%; }
.app-main { flex: 1; overflow-y: auto; padding: 16px 14px calc(16px + env(safe-area-inset-bottom)); }
.tabbar {
  display: flex; border-top: 1px solid var(--surface-2);
  padding-bottom: env(safe-area-inset-bottom); background: var(--bg);
}
.tabbar button {
  flex: 1; background: none; border: 0; color: var(--muted);
  padding: 10px 0; font-size: 11px; display: flex; flex-direction: column;
  align-items: center; gap: 3px;
}
.tabbar button.active { color: var(--text); }
.tabbar .ic { font-size: 20px; }
```

- [ ] **Step 4: Write the failing test for `BottomTabs`**

`src/components/BottomTabs.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { BottomTabs } from './BottomTabs'

describe('BottomTabs', () => {
  it('marks the active tab and reports changes', async () => {
    const onChange = vi.fn()
    render(<BottomTabs active="home" onChange={onChange} />)
    expect(screen.getByRole('button', { name: /home/i })).toHaveClass('active')
    await userEvent.click(screen.getByRole('button', { name: /growth/i }))
    expect(onChange).toHaveBeenCalledWith('growth')
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm install && npx vitest run src/components/BottomTabs.test.tsx`
Expected: FAIL — cannot find module `./BottomTabs`.

- [ ] **Step 6: Implement `BottomTabs`, `App`, and `main`**

`src/components/BottomTabs.tsx`:
```tsx
export type TabId = 'home' | 'history' | 'growth' | 'settings'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '🍼' },
  { id: 'history', label: 'History', icon: '📜' },
  { id: 'growth', label: 'Growth', icon: '📈' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

export function BottomTabs({
  active,
  onChange,
}: {
  active: TabId
  onChange: (t: TabId) => void
}) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={t.id === active ? 'active' : ''}
          aria-label={t.label}
          onClick={() => onChange(t.id)}
        >
          <span className="ic">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
```

`src/App.tsx`:
```tsx
import { useState } from 'react'
import { BottomTabs, type TabId } from './components/BottomTabs'

export default function App() {
  const [tab, setTab] = useState<TabId>('home')
  return (
    <div className="app">
      <main className="app-main">
        <h2 style={{ textTransform: 'capitalize' }}>{tab}</h2>
      </main>
      <BottomTabs active={tab} onChange={setTab} />
    </div>
  )
}
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/components/BottomTabs.test.tsx`
Expected: PASS (2 assertions).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite/React/TS PWA project with dark theme and tab shell"
```

---

## Task 2: Time & age utilities

**Files:**
- Create: `src/lib/time.ts`
- Test: `src/lib/time.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `formatClock(ts: number): string` → `"14:05"` (24h, local).
  - `formatDuration(ms: number): string` → `"18 min"`, `"1h 12m"`, `"45s"`.
  - `formatAgo(fromTs: number, now: number): string` → `"2h 15m ago"`, `"just now"`.
  - `ageLabel(dobTs: number, now: number): string` → `"4 mo"`, `"3 wk"`, `"6 d"`, `"2 y"`.
  - `startOfDay(ts: number): number`, `endOfDay(ts: number): number` (local-day boundaries, ms).

- [ ] **Step 1: Write the failing tests**

`src/lib/time.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { formatClock, formatDuration, formatAgo, ageLabel, startOfDay, endOfDay } from './time'

const at = (h: number, m: number) => new Date(2026, 5, 25, h, m, 0, 0).getTime()

describe('formatClock', () => {
  it('formats 24h local time', () => {
    expect(formatClock(at(14, 5))).toBe('14:05')
    expect(formatClock(at(9, 0))).toBe('09:00')
  })
})

describe('formatDuration', () => {
  it('formats seconds, minutes, and hours', () => {
    expect(formatDuration(45_000)).toBe('45s')
    expect(formatDuration(18 * 60_000)).toBe('18 min')
    expect(formatDuration(72 * 60_000)).toBe('1h 12m')
    expect(formatDuration(0)).toBe('0s')
  })
})

describe('formatAgo', () => {
  it('formats elapsed time with a floor of "just now"', () => {
    const now = at(14, 20)
    expect(formatAgo(now - 30_000, now)).toBe('just now')
    expect(formatAgo(now - 135 * 60_000, now)).toBe('2h 15m ago')
    expect(formatAgo(now - 5 * 60_000, now)).toBe('5m ago')
  })
})

describe('ageLabel', () => {
  it('chooses days, weeks, months, or years', () => {
    const now = at(12, 0)
    expect(ageLabel(now - 6 * 86_400_000, now)).toBe('6 d')
    expect(ageLabel(now - 21 * 86_400_000, now)).toBe('3 wk')
    expect(ageLabel(now - 130 * 86_400_000, now)).toBe('4 mo')
    expect(ageLabel(now - 800 * 86_400_000, now)).toBe('2 y')
  })
})

describe('day boundaries', () => {
  it('computes local start and end of day', () => {
    const ts = at(14, 5)
    expect(startOfDay(ts)).toBe(new Date(2026, 5, 25, 0, 0, 0, 0).getTime())
    expect(endOfDay(ts)).toBe(new Date(2026, 5, 25, 23, 59, 59, 999).getTime())
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/time.test.ts`
Expected: FAIL — cannot find module `./time`.

- [ ] **Step 3: Implement `src/lib/time.ts`**

```ts
const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')

export function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDuration(ms: number): string {
  if (ms < MIN) return `${Math.round(ms / 1000)}s`
  if (ms < HOUR) return `${Math.round(ms / MIN)} min`
  const h = Math.floor(ms / HOUR)
  const m = Math.round((ms % HOUR) / MIN)
  return `${h}h ${pad(m)}m`
}

export function formatAgo(fromTs: number, now: number): string {
  const ms = now - fromTs
  if (ms < MIN) return 'just now'
  if (ms < HOUR) return `${Math.round(ms / MIN)}m ago`
  const h = Math.floor(ms / HOUR)
  const m = Math.round((ms % HOUR) / MIN)
  return `${h}h ${pad(m)}m ago`
}

export function ageLabel(dobTs: number, now: number): string {
  const days = Math.floor((now - dobTs) / DAY)
  if (days < 14) return `${days} d`
  if (days < 60) return `${Math.floor(days / 7)} wk`
  const months = Math.floor(days / 30.4375)
  if (months < 24) return `${months} mo`
  return `${Math.floor(days / 365.25)} y`
}

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function endOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/time.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/time.ts src/lib/time.test.ts
git commit -m "feat: add time, duration, and age formatting utilities"
```

---

## Task 3: Unit conversion utilities

**Files:**
- Create: `src/lib/units.ts`
- Test: `src/lib/units.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (canonical → display and parse-back):
  - `gToKg(g: number): number`, `kgToG(kg: number): number`
  - `gToLbOz(g: number): { lb: number; oz: number }`
  - `mmToCm(mm: number): number`, `cmToMm(cm: number): number`
  - `mmToIn(mm: number): number`, `inToMm(inch: number): number`
  - `cToF(c: number): number`, `fToC(f: number): number`
  - `round1(n: number): number` helper (one decimal place).

- [ ] **Step 1: Write the failing tests**

`src/lib/units.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { gToKg, kgToG, gToLbOz, mmToCm, cmToMm, mmToIn, inToMm, cToF, fToC, round1 } from './units'

describe('weight', () => {
  it('converts grams <-> kg', () => {
    expect(gToKg(5200)).toBe(5.2)
    expect(kgToG(5.2)).toBe(5200)
  })
  it('converts grams -> lb/oz', () => {
    expect(gToLbOz(3500)).toEqual({ lb: 7, oz: 11 })
  })
})

describe('length', () => {
  it('converts mm <-> cm and mm -> in', () => {
    expect(mmToCm(620)).toBe(62)
    expect(cmToMm(62)).toBe(620)
    expect(round1(mmToIn(254))).toBe(10)
    expect(Math.round(inToMm(10))).toBe(254)
  })
})

describe('temperature', () => {
  it('converts C <-> F', () => {
    expect(cToF(37)).toBe(98.6)
    expect(round1(fToC(98.6))).toBe(37)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/units.test.ts`
Expected: FAIL — cannot find module `./units`.

- [ ] **Step 3: Implement `src/lib/units.ts`**

```ts
export const round1 = (n: number): number => Math.round(n * 10) / 10

export const gToKg = (g: number): number => round1(g / 1000)
export const kgToG = (kg: number): number => Math.round(kg * 1000)

export function gToLbOz(g: number): { lb: number; oz: number } {
  const totalOz = g / 28.349523125
  const lb = Math.floor(totalOz / 16)
  const oz = Math.round(totalOz - lb * 16)
  return oz === 16 ? { lb: lb + 1, oz: 0 } : { lb, oz }
}

export const mmToCm = (mm: number): number => round1(mm / 10)
export const cmToMm = (cm: number): number => Math.round(cm * 10)
export const mmToIn = (mm: number): number => mm / 25.4
export const inToMm = (inch: number): number => inch * 25.4

export const cToF = (c: number): number => round1(c * 9 / 5 + 32)
export const fToC = (f: number): number => ((f - 32) * 5) / 9
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/units.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/units.ts src/lib/units.test.ts
git commit -m "feat: add unit conversion utilities (weight, length, temperature)"
```

---

## Task 4: Daily totals and timer-elapsed logic

**Files:**
- Create: `src/db/types.ts` (types only — no DB code yet)
- Create: `src/lib/totals.ts`
- Create: `src/lib/timer.ts`
- Test: `src/lib/totals.test.ts`, `src/lib/timer.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `src/db/types.ts`:
    ```ts
    export type EntryType = 'breast' | 'bottle' | 'solids' | 'sleep' | 'diaper' | 'meds' | 'note'
    export type Side = 'L' | 'R' | 'both'
    export type DiaperKind = 'wet' | 'dirty' | 'both'
    export type MilkType = 'breast' | 'formula'
    export type MeasurementType = 'weight' | 'height' | 'head' | 'temperature'

    export interface Entry {
      id: number
      type: EntryType
      start_ts: number
      end_ts: number | null
      side: Side | null
      amount_ml: number | null
      milk_type: MilkType | null
      food: string | null
      diaper_kind: DiaperKind | null
      med_name: string | null
      med_dose: string | null
      note: string | null
      photo_id: number | null
      created_at: number
      updated_at: number
    }
    export interface Measurement {
      id: number
      type: MeasurementType
      ts: number
      value: number
      note: string | null
      created_at: number
      updated_at: number
    }
    export interface ActiveTimer { type: 'breast' | 'sleep'; start_ts: number; side: Side | null }
    export interface DailyTotals { feeds: number; diapers: number; sleepMs: number }
    ```
  - `src/lib/totals.ts`: `computeDailyTotals(entries: Entry[]): DailyTotals` — `feeds` counts `breast|bottle|solids`; `diapers` counts `diaper`; `sleepMs` sums `(end_ts ?? now-not-applicable)` — only completed sleeps with `end_ts` contribute.
  - `src/lib/timer.ts`: `elapsedMs(startTs: number, now: number): number`, `formatElapsed(ms: number): string` → `"04:12"` / `"1:04:12"`.

- [ ] **Step 1: Write the failing tests**

`src/lib/totals.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { computeDailyTotals } from './totals'
import type { Entry } from '../db/types'

const base = {
  end_ts: null, side: null, amount_ml: null, milk_type: null, food: null,
  diaper_kind: null, med_name: null, med_dose: null, note: null, photo_id: null,
  created_at: 0, updated_at: 0,
}
const entry = (id: number, type: Entry['type'], extra: Partial<Entry> = {}): Entry =>
  ({ id, type, start_ts: id * 1000, ...base, ...extra })

describe('computeDailyTotals', () => {
  it('counts feeds and diapers and sums completed sleep', () => {
    const entries: Entry[] = [
      entry(1, 'breast', { end_ts: 1000 + 18 * 60_000 }),
      entry(2, 'bottle'),
      entry(3, 'solids'),
      entry(4, 'diaper', { diaper_kind: 'wet' }),
      entry(5, 'diaper', { diaper_kind: 'dirty' }),
      entry(6, 'sleep', { start_ts: 0, end_ts: 50 * 60_000 }),
      entry(7, 'sleep', { start_ts: 0, end_ts: null }), // in-progress, ignored
      entry(8, 'note'),
    ]
    expect(computeDailyTotals(entries)).toEqual({
      feeds: 3,
      diapers: 2,
      sleepMs: 50 * 60_000,
    })
  })

  it('handles an empty day', () => {
    expect(computeDailyTotals([])).toEqual({ feeds: 0, diapers: 0, sleepMs: 0 })
  })
})
```

`src/lib/timer.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { elapsedMs, formatElapsed } from './timer'

describe('timer', () => {
  it('computes elapsed time, never negative', () => {
    expect(elapsedMs(1000, 5000)).toBe(4000)
    expect(elapsedMs(5000, 1000)).toBe(0)
  })
  it('formats mm:ss and h:mm:ss', () => {
    expect(formatElapsed(4 * 60_000 + 12_000)).toBe('04:12')
    expect(formatElapsed(3_600_000 + 4 * 60_000 + 12_000)).toBe('1:04:12')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/totals.test.ts src/lib/timer.test.ts`
Expected: FAIL — cannot find modules `./totals`, `./timer`, `../db/types`.

- [ ] **Step 3: Implement types, totals, and timer**

Create `src/db/types.ts` with exactly the contents shown in the Interfaces block above.

`src/lib/totals.ts`:
```ts
import type { Entry, DailyTotals } from '../db/types'

const FEED_TYPES = new Set(['breast', 'bottle', 'solids'])

export function computeDailyTotals(entries: Entry[]): DailyTotals {
  let feeds = 0
  let diapers = 0
  let sleepMs = 0
  for (const e of entries) {
    if (FEED_TYPES.has(e.type)) feeds++
    else if (e.type === 'diaper') diapers++
    else if (e.type === 'sleep' && e.end_ts != null) sleepMs += e.end_ts - e.start_ts
  }
  return { feeds, diapers, sleepMs }
}
```

`src/lib/timer.ts`:
```ts
const pad = (n: number) => String(n).padStart(2, '0')

export function elapsedMs(startTs: number, now: number): number {
  return Math.max(0, now - startTs)
}

export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/totals.test.ts src/lib/timer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/types.ts src/lib/totals.ts src/lib/totals.test.ts src/lib/timer.ts src/lib/timer.test.ts
git commit -m "feat: add daily totals and timer-elapsed logic with shared db types"
```

---

## Task 5: SQL executor interface, schema, and test executor

**Files:**
- Create: `src/db/executor.ts`
- Create: `src/db/schema.ts`
- Create: `src/db/testExecutor.ts`
- Test: `src/db/testExecutor.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `src/db/executor.ts`:
    ```ts
    export type Row = Record<string, unknown>
    export interface SqlExecutor {
      exec(sql: string, params?: unknown[]): Promise<Row[]>
      transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>
      close(): Promise<void>
    }
    ```
  - `src/db/schema.ts`: `export const SCHEMA_SQL: string` containing all `CREATE TABLE IF NOT EXISTS` statements.
  - `src/db/testExecutor.ts`: `export function makeTestExecutor(): SqlExecutor` backed by an in-memory `better-sqlite3`, schema applied on creation.

- [ ] **Step 1: Write the failing test**

`src/db/testExecutor.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { makeTestExecutor } from './testExecutor'

describe('makeTestExecutor', () => {
  it('applies the schema and supports parameterized exec', async () => {
    const db = await makeTestExecutor()
    const tables = await db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    )
    const names = tables.map((r) => r.name)
    expect(names).toEqual(
      expect.arrayContaining(['active_timer', 'entries', 'measurements', 'photos', 'settings']),
    )
    await db.exec('INSERT INTO settings (key, value) VALUES (?, ?)', ['units_weight', 'kg'])
    const rows = await db.exec('SELECT value FROM settings WHERE key = ?', ['units_weight'])
    expect(rows[0].value).toBe('kg')
    await db.close()
  })

  it('rolls back a failed transaction', async () => {
    const db = await makeTestExecutor()
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('INSERT INTO settings (key, value) VALUES (?, ?)', ['a', '1'])
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    const rows = await db.exec('SELECT * FROM settings')
    expect(rows).toHaveLength(0)
    await db.close()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/db/testExecutor.test.ts`
Expected: FAIL — cannot find module `./testExecutor`.

- [ ] **Step 3: Implement executor interface and schema**

`src/db/executor.ts`:
```ts
export type Row = Record<string, unknown>

export interface SqlExecutor {
  exec(sql: string, params?: unknown[]): Promise<Row[]>
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>
  close(): Promise<void>
}
```

`src/db/schema.ts`:
```ts
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
```

- [ ] **Step 4: Implement `src/db/testExecutor.ts`**

```ts
import Database from 'better-sqlite3'
import type { SqlExecutor, Row } from './executor'
import { SCHEMA_SQL } from './schema'

function wrap(db: Database.Database): SqlExecutor {
  const exec = async (sql: string, params: unknown[] = []): Promise<Row[]> => {
    const stmt = db.prepare(sql)
    if (stmt.reader) return stmt.all(...(params as never[])) as Row[]
    stmt.run(...(params as never[]))
    return []
  }
  return {
    exec,
    async transaction(fn) {
      db.exec('BEGIN')
      try {
        const result = await fn(wrap(db))
        db.exec('COMMIT')
        return result
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    },
    async close() {
      db.close()
    },
  }
}

export async function makeTestExecutor(): Promise<SqlExecutor> {
  const db = new Database(':memory:')
  db.exec(SCHEMA_SQL)
  return wrap(db)
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/db/testExecutor.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/executor.ts src/db/schema.ts src/db/testExecutor.ts src/db/testExecutor.test.ts
git commit -m "feat: add SqlExecutor interface, SQLite schema, and in-memory test executor"
```

---

## Task 6: Typed query functions (CRUD + settings + timer)

**Files:**
- Create: `src/db/queries.ts`
- Test: `src/db/queries.test.ts`

**Interfaces:**
- Consumes: `SqlExecutor`, `Row` from `./executor`; types from `./types`.
- Produces (all async, all take `exec: SqlExecutor` as first arg):
  - `insertEntry(exec, data: NewEntry): Promise<number>` where `NewEntry = Omit<Entry,'id'|'created_at'|'updated_at'>`.
  - `listEntries(exec, opts?: { type?: EntryType; limit?: number }): Promise<Entry[]>` (newest first by `start_ts`).
  - `listEntriesBetween(exec, fromTs: number, toTs: number): Promise<Entry[]>` (newest first).
  - `updateEntry(exec, id: number, patch: Partial<NewEntry>): Promise<void>`.
  - `deleteEntry(exec, id: number): Promise<void>`.
  - `insertMeasurement(exec, data: NewMeasurement): Promise<number>`; `listMeasurements(exec, type: MeasurementType): Promise<Measurement[]>` (oldest first by `ts`); `deleteMeasurement(exec, id): Promise<void>`.
  - `getSetting(exec, key): Promise<string | null>`; `setSetting(exec, key, value): Promise<void>`.
  - `startTimer(exec, t: ActiveTimer): Promise<void>`; `getActiveTimer(exec): Promise<ActiveTimer | null>`; `clearTimer(exec, type): Promise<void>`.
  - `lastEntryByType(exec, type: EntryType): Promise<Entry | null>`.

- [ ] **Step 1: Write the failing tests**

`src/db/queries.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { makeTestExecutor } from './testExecutor'
import type { SqlExecutor } from './executor'
import {
  insertEntry, listEntries, listEntriesBetween, updateEntry, deleteEntry,
  insertMeasurement, listMeasurements, deleteMeasurement,
  getSetting, setSetting, startTimer, getActiveTimer, clearTimer, lastEntryByType,
} from './queries'

let db: SqlExecutor
beforeEach(async () => { db = await makeTestExecutor() })

const newEntry = (over = {}) => ({
  type: 'breast' as const, start_ts: 1000, end_ts: null, side: 'L' as const,
  amount_ml: null, milk_type: null, food: null, diaper_kind: null,
  med_name: null, med_dose: null, note: null, photo_id: null, ...over,
})

describe('entries CRUD', () => {
  it('inserts and reads back with generated id and timestamps', async () => {
    const id = await insertEntry(db, newEntry())
    expect(id).toBeGreaterThan(0)
    const [row] = await listEntries(db)
    expect(row.id).toBe(id)
    expect(row.type).toBe('breast')
    expect(row.created_at).toBeGreaterThan(0)
  })

  it('lists newest first and filters by type', async () => {
    await insertEntry(db, newEntry({ start_ts: 100 }))
    await insertEntry(db, newEntry({ type: 'diaper', start_ts: 200, side: null, diaper_kind: 'wet' }))
    const all = await listEntries(db)
    expect(all.map((e) => e.start_ts)).toEqual([200, 100])
    const diapers = await listEntries(db, { type: 'diaper' })
    expect(diapers).toHaveLength(1)
  })

  it('lists entries within a time window', async () => {
    await insertEntry(db, newEntry({ start_ts: 50 }))
    await insertEntry(db, newEntry({ start_ts: 150 }))
    await insertEntry(db, newEntry({ start_ts: 250 }))
    const rows = await listEntriesBetween(db, 100, 200)
    expect(rows.map((e) => e.start_ts)).toEqual([150])
  })

  it('updates and bumps updated_at', async () => {
    const id = await insertEntry(db, newEntry())
    await updateEntry(db, id, { end_ts: 5000, note: 'sleepy' })
    const [row] = await listEntries(db)
    expect(row.end_ts).toBe(5000)
    expect(row.note).toBe('sleepy')
  })

  it('deletes', async () => {
    const id = await insertEntry(db, newEntry())
    await deleteEntry(db, id)
    expect(await listEntries(db)).toHaveLength(0)
  })

  it('finds the last entry of a type', async () => {
    await insertEntry(db, newEntry({ start_ts: 100 }))
    await insertEntry(db, newEntry({ start_ts: 300 }))
    const last = await lastEntryByType(db, 'breast')
    expect(last?.start_ts).toBe(300)
    expect(await lastEntryByType(db, 'bottle')).toBeNull()
  })
})

describe('measurements', () => {
  it('inserts and lists oldest first per type', async () => {
    await insertMeasurement(db, { type: 'weight', ts: 200, value: 5200, note: null })
    await insertMeasurement(db, { type: 'weight', ts: 100, value: 5000, note: null })
    await insertMeasurement(db, { type: 'height', ts: 100, value: 620, note: null })
    const weights = await listMeasurements(db, 'weight')
    expect(weights.map((m) => m.ts)).toEqual([100, 200])
    expect(await listMeasurements(db, 'height')).toHaveLength(1)
  })
  it('deletes', async () => {
    const id = await insertMeasurement(db, { type: 'weight', ts: 1, value: 5000, note: null })
    await deleteMeasurement(db, id)
    expect(await listMeasurements(db, 'weight')).toHaveLength(0)
  })
})

describe('settings', () => {
  it('upserts and reads, returns null when missing', async () => {
    expect(await getSetting(db, 'units_weight')).toBeNull()
    await setSetting(db, 'units_weight', 'lb')
    expect(await getSetting(db, 'units_weight')).toBe('lb')
    await setSetting(db, 'units_weight', 'kg')
    expect(await getSetting(db, 'units_weight')).toBe('kg')
  })
})

describe('active timer', () => {
  it('starts, reads, and clears a timer', async () => {
    expect(await getActiveTimer(db)).toBeNull()
    await startTimer(db, { type: 'breast', start_ts: 1234, side: 'R' })
    const t = await getActiveTimer(db)
    expect(t).toEqual({ type: 'breast', start_ts: 1234, side: 'R' })
    await clearTimer(db, 'breast')
    expect(await getActiveTimer(db)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/db/queries.test.ts`
Expected: FAIL — cannot find module `./queries`.

- [ ] **Step 3: Implement `src/db/queries.ts`**

```ts
import type { SqlExecutor } from './executor'
import type {
  Entry, EntryType, Measurement, MeasurementType, ActiveTimer,
} from './types'

export type NewEntry = Omit<Entry, 'id' | 'created_at' | 'updated_at'>
export type NewMeasurement = Omit<Measurement, 'id' | 'created_at' | 'updated_at'>

const now = () => Date.now()

const ENTRY_COLS = [
  'type', 'start_ts', 'end_ts', 'side', 'amount_ml', 'milk_type', 'food',
  'diaper_kind', 'med_name', 'med_dose', 'note', 'photo_id',
] as const

export async function insertEntry(exec: SqlExecutor, data: NewEntry): Promise<number> {
  const ts = now()
  const cols = [...ENTRY_COLS, 'created_at', 'updated_at']
  const placeholders = cols.map(() => '?').join(', ')
  const values = [...ENTRY_COLS.map((c) => data[c]), ts, ts]
  const rows = await exec(
    `INSERT INTO entries (${cols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
    values,
  )
  return rows[0].id as number
}

export async function listEntries(
  exec: SqlExecutor,
  opts: { type?: EntryType; limit?: number } = {},
): Promise<Entry[]> {
  const where = opts.type ? 'WHERE type = ?' : ''
  const limit = opts.limit ? `LIMIT ${Number(opts.limit)}` : ''
  const params = opts.type ? [opts.type] : []
  return (await exec(
    `SELECT * FROM entries ${where} ORDER BY start_ts DESC ${limit}`,
    params,
  )) as unknown as Entry[]
}

export async function listEntriesBetween(
  exec: SqlExecutor, fromTs: number, toTs: number,
): Promise<Entry[]> {
  return (await exec(
    'SELECT * FROM entries WHERE start_ts >= ? AND start_ts <= ? ORDER BY start_ts DESC',
    [fromTs, toTs],
  )) as unknown as Entry[]
}

export async function lastEntryByType(
  exec: SqlExecutor, type: EntryType,
): Promise<Entry | null> {
  const rows = (await exec(
    'SELECT * FROM entries WHERE type = ? ORDER BY start_ts DESC LIMIT 1',
    [type],
  )) as unknown as Entry[]
  return rows[0] ?? null
}

export async function updateEntry(
  exec: SqlExecutor, id: number, patch: Partial<NewEntry>,
): Promise<void> {
  const keys = Object.keys(patch) as (keyof NewEntry)[]
  if (keys.length === 0) return
  const set = keys.map((k) => `${k} = ?`).join(', ')
  const values = keys.map((k) => patch[k])
  await exec(`UPDATE entries SET ${set}, updated_at = ? WHERE id = ?`, [...values, now(), id])
}

export async function deleteEntry(exec: SqlExecutor, id: number): Promise<void> {
  await exec('DELETE FROM entries WHERE id = ?', [id])
}

export async function insertMeasurement(
  exec: SqlExecutor, data: NewMeasurement,
): Promise<number> {
  const ts = now()
  const rows = await exec(
    `INSERT INTO measurements (type, ts, value, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    [data.type, data.ts, data.value, data.note, ts, ts],
  )
  return rows[0].id as number
}

export async function listMeasurements(
  exec: SqlExecutor, type: MeasurementType,
): Promise<Measurement[]> {
  return (await exec(
    'SELECT * FROM measurements WHERE type = ? ORDER BY ts ASC',
    [type],
  )) as unknown as Measurement[]
}

export async function deleteMeasurement(exec: SqlExecutor, id: number): Promise<void> {
  await exec('DELETE FROM measurements WHERE id = ?', [id])
}

export async function getSetting(exec: SqlExecutor, key: string): Promise<string | null> {
  const rows = await exec('SELECT value FROM settings WHERE key = ?', [key])
  return rows.length ? (rows[0].value as string) : null
}

export async function setSetting(exec: SqlExecutor, key: string, value: string): Promise<void> {
  await exec(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  )
}

export async function startTimer(exec: SqlExecutor, t: ActiveTimer): Promise<void> {
  await exec(
    `INSERT INTO active_timer (type, start_ts, side) VALUES (?, ?, ?)
     ON CONFLICT(type) DO UPDATE SET start_ts = excluded.start_ts, side = excluded.side`,
    [t.type, t.start_ts, t.side],
  )
}

export async function getActiveTimer(exec: SqlExecutor): Promise<ActiveTimer | null> {
  const rows = await exec('SELECT * FROM active_timer LIMIT 1')
  if (!rows.length) return null
  const r = rows[0]
  return { type: r.type as ActiveTimer['type'], start_ts: r.start_ts as number, side: r.side as ActiveTimer['side'] }
}

export async function clearTimer(exec: SqlExecutor, type: ActiveTimer['type']): Promise<void> {
  await exec('DELETE FROM active_timer WHERE type = ?', [type])
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/db/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/queries.ts src/db/queries.test.ts
git commit -m "feat: add typed SQL query functions for entries, measurements, settings, timer"
```

---

## Task 7: SQLite worker, browser client, and DbProvider

**Files:**
- Create: `src/db/worker.ts`
- Create: `src/db/client.ts`
- Modify: `src/main.tsx` (wrap `<App/>` in `<DbProvider>`)

**Interfaces:**
- Consumes: `SqlExecutor`, `Row` from `./executor`; `SCHEMA_SQL` from `./schema`.
- Produces:
  - `src/db/worker.ts`: a module Web Worker that opens an OPFS-backed SQLite DB named `baby-tracker.sqlite3`, applies `SCHEMA_SQL`, and answers messages `{id, kind:'exec', sql, params}` → `{id, ok, rows}`, `{id, kind:'export'}` → `{id, ok, bytes}` (Uint8Array), `{id, kind:'import', bytes}` → `{id, ok}`. Transactions are emulated client-side via `BEGIN`/`COMMIT`/`ROLLBACK` exec calls.
  - `src/db/client.ts`:
    - `makeWorkerExecutor(): SqlExecutor` (also exposes `exportBytes(): Promise<Uint8Array>` and `importBytes(bytes: Uint8Array): Promise<void>` through an extended return type `WorkerExecutor`).
    - `DbProvider({ children, executor? })` React context provider that creates the executor once.
    - `useDb(): SqlExecutor` hook.

- [ ] **Step 1: Implement the worker**

`src/db/worker.ts`:
```ts
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { SCHEMA_SQL } from './schema'

type ExecMsg = { id: number; kind: 'exec'; sql: string; params: unknown[] }
type ExportMsg = { id: number; kind: 'export' }
type ImportMsg = { id: number; kind: 'import'; bytes: Uint8Array }
type Msg = ExecMsg | ExportMsg | ImportMsg

const DB_NAME = 'baby-tracker.sqlite3'
let db: any

async function ready() {
  if (db) return db
  const sqlite3 = await sqlite3InitModule()
  // OPFS persistent VFS; requires running inside a Worker.
  db = new sqlite3.oo1.OpfsDb(DB_NAME)
  db.exec(SCHEMA_SQL)
  return db
}

function runExec(sql: string, params: unknown[]) {
  return ready().then((d) => {
    const rows: Record<string, unknown>[] = []
    d.exec({ sql, bind: params as never, rowMode: 'object', resultRows: rows })
    return rows
  })
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const msg = e.data
  try {
    if (msg.kind === 'exec') {
      const rows = await runExec(msg.sql, msg.params)
      ;(self as unknown as Worker).postMessage({ id: msg.id, ok: true, rows })
    } else if (msg.kind === 'export') {
      const d = await ready()
      const bytes: Uint8Array = d.sqlite3 ? d.sqlite3.capi.sqlite3_js_db_export(d) : d.dbHandle
      ;(self as unknown as Worker).postMessage({ id: msg.id, ok: true, bytes }, [bytes.buffer])
    } else {
      // import: overwrite OPFS file, then reopen
      const sqlite3 = await sqlite3InitModule()
      const d = await ready()
      d.close()
      await sqlite3.oo1.OpfsDb.importDb(DB_NAME, msg.bytes)
      db = new sqlite3.oo1.OpfsDb(DB_NAME)
      ;(self as unknown as Worker).postMessage({ id: msg.id, ok: true })
    }
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id: msg.id, ok: false, error: String(err) })
  }
}
```

> Note: the sqlite-wasm export API is `sqlite3.capi.sqlite3_js_db_export(db)`. The line above keeps a defensive fallback; during implementation, verify against the installed version and simplify to the documented call.

- [ ] **Step 2: Implement the client**

`src/db/client.ts`:
```ts
import { createContext, createElement, useContext, useRef, type ReactNode } from 'react'
import type { SqlExecutor, Row } from './executor'

export interface WorkerExecutor extends SqlExecutor {
  exportBytes(): Promise<Uint8Array>
  importBytes(bytes: Uint8Array): Promise<void>
}

export function makeWorkerExecutor(): WorkerExecutor {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  let seq = 0
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>()

  worker.onmessage = (e: MessageEvent) => {
    const { id, ok, rows, bytes, error } = e.data
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    ok ? p.resolve({ rows, bytes }) : p.reject(new Error(error))
  }

  const send = (payload: Record<string, unknown>, transfer: Transferable[] = []) =>
    new Promise<any>((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      worker.postMessage({ id, ...payload }, transfer)
    })

  const exec = async (sql: string, params: unknown[] = []): Promise<Row[]> => {
    const { rows } = await send({ kind: 'exec', sql, params })
    return rows as Row[]
  }

  return {
    exec,
    async transaction(fn) {
      await exec('BEGIN')
      try {
        const result = await fn({ exec, transaction: async (f) => f(this), close: async () => {} } as SqlExecutor)
        await exec('COMMIT')
        return result
      } catch (err) {
        await exec('ROLLBACK')
        throw err
      }
    },
    async close() { worker.terminate() },
    async exportBytes() {
      const { bytes } = await send({ kind: 'export' })
      return bytes as Uint8Array
    },
    async importBytes(bytes: Uint8Array) {
      await send({ kind: 'import', bytes }, [bytes.buffer])
    },
  }
}

const DbContext = createContext<WorkerExecutor | null>(null)

export function DbProvider({ children, executor }: { children: ReactNode; executor?: WorkerExecutor }) {
  const ref = useRef<WorkerExecutor | null>(null)
  if (!ref.current) ref.current = executor ?? makeWorkerExecutor()
  return createElement(DbContext.Provider, { value: ref.current }, children)
}

export function useDb(): WorkerExecutor {
  const db = useContext(DbContext)
  if (!db) throw new Error('useDb must be used within <DbProvider>')
  return db
}
```

- [ ] **Step 3: Wrap the app in `DbProvider`**

Modify `src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { DbProvider } from './db/client'
import './styles/theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DbProvider>
      <App />
    </DbProvider>
  </StrictMode>,
)
```

- [ ] **Step 4: Verify type-check and existing tests still pass**

Run: `npx tsc -b && npm test`
Expected: type-check clean; all prior test files PASS. (The worker/client are exercised manually in the browser and via component tests that inject a test executor in later tasks — they are not unit-tested here because OPFS is unavailable in jsdom.)

- [ ] **Step 5: Manual browser smoke check**

Run: `npm run dev`, open the printed URL. Open DevTools → Application → check no console errors from the worker; the app shell renders. (OPFS DB initializes lazily on first query in later tasks.)

- [ ] **Step 6: Commit**

```bash
git add src/db/worker.ts src/db/client.ts src/main.tsx
git commit -m "feat: add SQLite OPFS worker, async client executor, and DbProvider"
```

---

## Task 8: Active-timer hook and a shared data hook

**Files:**
- Create: `src/state/useActiveTimer.ts`
- Create: `src/state/useEntries.ts`
- Test: `src/state/useActiveTimer.test.tsx`

**Interfaces:**
- Consumes: `useDb`, query functions, `elapsedMs` from `src/lib/timer.ts`.
- Produces:
  - `useActiveTimer(): { timer: ActiveTimer | null; elapsed: number; refresh: () => Promise<void> }` — polls `getActiveTimer` on mount and recomputes `elapsed` every second from `start_ts` (no stored counter).
  - `useEntries(rangeFromTs, rangeToTs): { entries: Entry[]; reload: () => Promise<void> }`.

- [ ] **Step 1: Write the failing test (timer elapsed reactivity)**

`src/state/useActiveTimer.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { DbProvider } from '../db/client'
import { makeTestExecutor } from '../db/testExecutor'
import { startTimer } from '../db/queries'
import { useActiveTimer } from './useActiveTimer'
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

describe('useActiveTimer', () => {
  it('loads the running timer and advances elapsed each second', async () => {
    vi.setSystemTime(10_000)
    await startTimer(exec, { type: 'breast', start_ts: 4_000, side: 'L' })
    const { result } = renderHook(() => useActiveTimer(), { wrapper })
    await waitFor(() => expect(result.current.timer?.type).toBe('breast'))
    expect(result.current.elapsed).toBe(6_000)
    await act(async () => { vi.setSystemTime(12_000); vi.advanceTimersByTime(1_000) })
    expect(result.current.elapsed).toBe(8_000)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/state/useActiveTimer.test.tsx`
Expected: FAIL — cannot find module `./useActiveTimer`.

- [ ] **Step 3: Implement the hooks**

`src/state/useActiveTimer.ts`:
```ts
import { useCallback, useEffect, useState } from 'react'
import { useDb } from '../db/client'
import { getActiveTimer } from '../db/queries'
import { elapsedMs } from '../lib/timer'
import type { ActiveTimer } from '../db/types'

export function useActiveTimer() {
  const db = useDb()
  const [timer, setTimer] = useState<ActiveTimer | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const refresh = useCallback(async () => {
    setTimer(await getActiveTimer(db))
  }, [db])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (!timer) { setElapsed(0); return }
    const tick = () => setElapsed(elapsedMs(timer.start_ts, Date.now()))
    tick()
    const h = setInterval(tick, 1000)
    return () => clearInterval(h)
  }, [timer])

  return { timer, elapsed, refresh }
}
```

`src/state/useEntries.ts`:
```ts
import { useCallback, useEffect, useState } from 'react'
import { useDb } from '../db/client'
import { listEntriesBetween } from '../db/queries'
import type { Entry } from '../db/types'

export function useEntries(fromTs: number, toTs: number) {
  const db = useDb()
  const [entries, setEntries] = useState<Entry[]>([])
  const reload = useCallback(async () => {
    setEntries(await listEntriesBetween(db, fromTs, toTs))
  }, [db, fromTs, toTs])
  useEffect(() => { void reload() }, [reload])
  return { entries, reload }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/state/useActiveTimer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/useActiveTimer.ts src/state/useEntries.ts src/state/useActiveTimer.test.tsx
git commit -m "feat: add useActiveTimer and useEntries hooks"
```

---

## Task 9: Home screen — grid, totals, timeline, timer banner

**Files:**
- Create: `src/components/home/QuickLogGrid.tsx`
- Create: `src/components/home/TotalsStrip.tsx`
- Create: `src/components/home/Timeline.tsx`
- Create: `src/components/home/TimerBanner.tsx`
- Create: `src/components/home/Home.tsx`
- Create: `src/components/home/entryLabel.ts` (pure: one-line summary for an entry)
- Modify: `src/App.tsx` (render `Home` for the home tab)
- Test: `src/components/home/entryLabel.test.ts`, `src/components/home/Home.test.tsx`

**Interfaces:**
- Consumes: `useEntries`, `useActiveTimer`, `computeDailyTotals`, `lastEntryByType`, `formatAgo`, `formatClock`, `formatDuration`, `formatElapsed`.
- Produces:
  - `entryLabel(e: Entry): { icon: string; text: string }`.
  - `Home({ onLog }: { onLog: (type: LogTarget) => void })` where `type LogTarget = EntryType | 'measure' | 'temperature'`.
  - `QuickLogGrid({ lasts, onLog })`, `TotalsStrip({ totals })`, `Timeline({ entries, onSelect })`, `TimerBanner({ timer, elapsed, onStop })`.

- [ ] **Step 1: Write the failing test for `entryLabel`**

`src/components/home/entryLabel.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { entryLabel } from './entryLabel'
import type { Entry } from '../../db/types'

const base = {
  id: 1, start_ts: 0, end_ts: null, side: null, amount_ml: null, milk_type: null,
  food: null, diaper_kind: null, med_name: null, med_dose: null, note: null,
  photo_id: null, created_at: 0, updated_at: 0,
}

describe('entryLabel', () => {
  it('summarizes each entry type', () => {
    expect(entryLabel({ ...base, type: 'breast', side: 'L', end_ts: 18 * 60_000 }))
      .toEqual({ icon: '🤱', text: 'Breast · L · 18 min' })
    expect(entryLabel({ ...base, type: 'bottle', amount_ml: 90, milk_type: 'formula' }))
      .toEqual({ icon: '🍼', text: 'Bottle · 90ml · formula' })
    expect(entryLabel({ ...base, type: 'diaper', diaper_kind: 'dirty' }))
      .toEqual({ icon: '💩', text: 'Diaper · dirty' })
    expect(entryLabel({ ...base, type: 'sleep', end_ts: 50 * 60_000 }))
      .toEqual({ icon: '😴', text: 'Sleep · 50 min' })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/home/entryLabel.test.ts`
Expected: FAIL — cannot find module `./entryLabel`.

- [ ] **Step 3: Implement `entryLabel.ts`**

```ts
import type { Entry } from '../../db/types'
import { formatDuration } from '../../lib/time'

export function entryLabel(e: Entry): { icon: string; text: string } {
  const dur = e.end_ts != null ? formatDuration(e.end_ts - e.start_ts) : null
  switch (e.type) {
    case 'breast':
      return { icon: '🤱', text: ['Breast', e.side, dur].filter(Boolean).join(' · ') }
    case 'bottle':
      return { icon: '🍼', text: ['Bottle', e.amount_ml != null ? `${e.amount_ml}ml` : null, e.milk_type].filter(Boolean).join(' · ') }
    case 'solids':
      return { icon: '🥄', text: ['Solids', e.food].filter(Boolean).join(' · ') }
    case 'sleep':
      return { icon: '😴', text: ['Sleep', dur].filter(Boolean).join(' · ') }
    case 'diaper':
      return { icon: e.diaper_kind === 'dirty' ? '💩' : '💧', text: ['Diaper', e.diaper_kind].filter(Boolean).join(' · ') }
    case 'meds':
      return { icon: '💊', text: ['Meds', e.med_name, e.med_dose].filter(Boolean).join(' · ') }
    case 'note':
      return { icon: '📝', text: e.note ?? 'Note' }
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/home/entryLabel.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the presentational components**

`src/components/home/TotalsStrip.tsx`:
```tsx
import type { DailyTotals } from '../../db/types'
import { formatDuration } from '../../lib/time'

export function TotalsStrip({ totals }: { totals: DailyTotals }) {
  return (
    <div className="totals">
      <div className="t"><b>{totals.feeds}</b><span>feeds</span></div>
      <div className="t"><b>{totals.diapers}</b><span>nappies</span></div>
      <div className="t"><b>{formatDuration(totals.sleepMs)}</b><span>sleep</span></div>
    </div>
  )
}
```

`src/components/home/QuickLogGrid.tsx`:
```tsx
import type { EntryType } from '../../db/types'
import { formatAgo } from '../../lib/time'

export type LogTarget = EntryType | 'measure' | 'temperature'

const BUTTONS: { target: LogTarget; icon: string; label: string }[] = [
  { target: 'breast', icon: '🤱', label: 'Breast' },
  { target: 'bottle', icon: '🍼', label: 'Bottle' },
  { target: 'sleep', icon: '😴', label: 'Sleep' },
  { target: 'diaper', icon: '💧', label: 'Diaper' },
  { target: 'solids', icon: '🥄', label: 'Solids' },
  { target: 'meds', icon: '💊', label: 'Meds' },
]

export function QuickLogGrid({
  lasts, onLog, now,
}: {
  lasts: Partial<Record<LogTarget, number>>
  onLog: (t: LogTarget) => void
  now: number
}) {
  return (
    <div className="grid">
      {BUTTONS.map((b) => (
        <button key={b.target} className="gbtn" onClick={() => onLog(b.target)}>
          <span className="ic">{b.icon}</span>
          <span className="nm">{b.label}</span>
          <span className="ago">{lasts[b.target] != null ? formatAgo(lasts[b.target]!, now) : '—'}</span>
        </button>
      ))}
    </div>
  )
}
```

`src/components/home/Timeline.tsx`:
```tsx
import type { Entry } from '../../db/types'
import { formatClock } from '../../lib/time'
import { entryLabel } from './entryLabel'

export function Timeline({ entries, onSelect }: { entries: Entry[]; onSelect: (e: Entry) => void }) {
  if (entries.length === 0) return <p className="muted">No entries yet today.</p>
  return (
    <div className="tl">
      {entries.map((e) => {
        const { icon, text } = entryLabel(e)
        return (
          <button key={e.id} className="row" onClick={() => onSelect(e)}>
            <span className="tm">{formatClock(e.start_ts)}</span>
            <span className="dot">{icon}</span>
            <span>{text}</span>
          </button>
        )
      })}
    </div>
  )
}
```

`src/components/home/TimerBanner.tsx`:
```tsx
import type { ActiveTimer } from '../../db/types'
import { formatElapsed } from '../../lib/timer'

export function TimerBanner({
  timer, elapsed, onStop,
}: {
  timer: ActiveTimer
  elapsed: number
  onStop: () => void
}) {
  return (
    <button className="timer-banner" onClick={onStop}>
      ● {timer.type === 'breast' ? `Breastfeed (${timer.side})` : 'Sleep'} timing… {formatElapsed(elapsed)} — tap to stop
    </button>
  )
}
```

Add to `src/styles/theme.css`:
```css
.grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 14px; }
.gbtn { background: var(--surface); border: 0; border-radius: var(--radius); padding: 12px 6px; color: var(--text); display: flex; flex-direction: column; align-items: center; gap: 3px; }
.gbtn .ic { font-size: 22px; } .gbtn .nm { font-weight: 600; font-size: 13px; } .gbtn .ago { font-size: 10px; color: var(--muted); }
.totals { display: flex; gap: 8px; margin-bottom: 14px; }
.totals .t { flex: 1; background: var(--surface-2); border-radius: 10px; padding: 8px 4px; text-align: center; }
.totals .t b { display: block; font-size: 16px; } .totals .t span { font-size: 10px; color: var(--muted); }
.tl { display: flex; flex-direction: column; }
.tl .row { display: flex; gap: 10px; align-items: center; background: none; border: 0; border-bottom: 1px solid var(--surface-2); color: var(--text); padding: 9px 2px; text-align: left; }
.tl .row .tm { width: 46px; color: var(--muted); font-size: 12px; } .tl .row .dot { font-size: 15px; }
.muted { color: var(--muted); }
.timer-banner { width: 100%; background: var(--green); color: #fff; border: 0; border-radius: var(--radius); padding: 11px; margin-bottom: 12px; font-weight: 600; }
.sectlbl { text-transform: uppercase; font-size: 10px; letter-spacing: .5px; color: var(--muted); margin: 6px 2px; }
```

- [ ] **Step 6: Implement `Home.tsx`**

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

const LAST_TYPES: EntryType[] = ['breast', 'bottle', 'sleep', 'diaper', 'solids', 'meds']

export function Home({
  onLog, onSelectEntry,
}: {
  onLog: (t: LogTarget) => void
  onSelectEntry: (e: Entry) => void
}) {
  const db = useDb()
  const now = Date.now()
  const { entries, reload } = useEntries(startOfDay(now), endOfDay(now))
  const { timer, elapsed, refresh } = useActiveTimer()
  const [lasts, setLasts] = useState<Partial<Record<LogTarget, number>>>({})
  const totals = useMemo(() => computeDailyTotals(entries), [entries])

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
      {timer && <TimerBanner timer={timer} elapsed={elapsed} onStop={stopTimer} />}
      <QuickLogGrid lasts={lasts} onLog={onLog} now={now} />
      <div className="sectlbl">Today</div>
      <TotalsStrip totals={totals} />
      <div className="sectlbl">Timeline</div>
      <Timeline entries={entries} onSelect={onSelectEntry} />
    </div>
  )
}
```

- [ ] **Step 7: Write the failing Home integration test**

`src/components/home/Home.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { DbProvider, type WorkerExecutor } from '../../db/client'
import { makeTestExecutor } from '../../db/testExecutor'
import { insertEntry } from '../../db/queries'
import { Home } from './Home'

let exec: WorkerExecutor
beforeEach(async () => {
  const base = await makeTestExecutor()
  exec = Object.assign(base, { exportBytes: async () => new Uint8Array(), importBytes: async () => {} }) as WorkerExecutor
})
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DbProvider, { executor: exec, children })

describe('Home', () => {
  it('renders today totals and the timeline from the database', async () => {
    await insertEntry(exec, {
      type: 'bottle', start_ts: Date.now(), end_ts: null, side: null, amount_ml: 90,
      milk_type: 'formula', food: null, diaper_kind: null, med_name: null,
      med_dose: null, note: null, photo_id: null,
    })
    render(<Home onLog={() => {}} onSelectEntry={() => {}} />, { wrapper })
    await waitFor(() => expect(screen.getByText(/90ml · formula/)).toBeInTheDocument())
    expect(screen.getByText('1')).toBeInTheDocument() // 1 feed total
  })
})
```

- [ ] **Step 8: Wire `Home` into `App` and run all tests**

Modify `src/App.tsx` to render `Home` on the home tab (sheet wiring comes in Task 10; for now pass no-op handlers, but keep state for the selected log target and entry):
```tsx
import { useState } from 'react'
import { BottomTabs, type TabId } from './components/BottomTabs'
import { Home } from './components/home/Home'

export default function App() {
  const [tab, setTab] = useState<TabId>('home')
  return (
    <div className="app">
      <main className="app-main">
        {tab === 'home' && <Home onLog={() => {}} onSelectEntry={() => {}} />}
        {tab !== 'home' && <h2 style={{ textTransform: 'capitalize' }}>{tab}</h2>}
      </main>
      <BottomTabs active={tab} onChange={setTab} />
    </div>
  )
}
```

Run: `npx vitest run src/components/home/`
Expected: PASS (entryLabel + Home tests).

- [ ] **Step 9: Commit**

```bash
git add src/components/home src/App.tsx src/styles/theme.css
git commit -m "feat: build Home screen with quick-log grid, totals, timeline, and timer banner"
```

---

## Task 10: Log sheet and entry forms (timer + manual fallback)

**Files:**
- Create: `src/components/home/LogSheet.tsx`
- Create: `src/components/home/forms/BreastForm.tsx`, `BottleForm.tsx`, `SleepForm.tsx`, `SolidsForm.tsx`, `DiaperForm.tsx`, `MedsForm.tsx`, `NoteForm.tsx`
- Create: `src/components/home/forms/formKit.tsx` (shared field widgets: `Stepper`, `TimeField`, `Toggle`, `SheetButtons`)
- Modify: `src/App.tsx` (own the sheet open/close state and refresh)
- Modify: `src/styles/theme.css` (sheet styles)
- Test: `src/components/home/forms/BreastForm.test.tsx`, `DiaperForm.test.tsx`

**Interfaces:**
- Consumes: `useDb`, query functions, `startTimer`, `clearTimer`, `formatElapsed`, `useActiveTimer`.
- Produces:
  - `LogSheet({ target, onClose, onSaved })` where `target: LogTarget | null` — renders the matching form (measure/temperature delegate to Task 11's `MeasureForm`, imported lazily; for this task, `measure`/`temperature` are passed through and handled in Task 11).
  - Each form exposes `({ onClose, onSaved }: FormProps)` and calls `insertEntry`/`startTimer` then `onSaved()`.
  - `formKit` widgets: `Toggle<T>({ options, value, onChange })`, `Stepper({ label, value, step, min, unit, onChange })`, `TimeField({ value, onChange })`, `SheetButtons({ onCancel, primaryLabel, onPrimary })`.

- [ ] **Step 1: Implement `formKit.tsx`**

```tsx
export function Toggle<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="toggle">
      {options.map((o) => (
        <button key={o.value} className={`opt ${o.value === value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stepper({
  label, value, step, min = 0, unit, onChange,
}: { label: string; value: number; step: number; min?: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <button className="pm" aria-label={`decrease ${label}`} onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <div className="mid"><b>{value} {unit}</b><span>{label}</span></div>
      <button className="pm" aria-label={`increase ${label}`} onClick={() => onChange(value + step)}>+</button>
    </div>
  )
}

export function TimeField({ value, onChange }: { value: number; onChange: (ts: number) => void }) {
  const d = new Date(value)
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return (
    <label className="timefield">
      <span>When</span>
      <input type="datetime-local" value={local} onChange={(e) => onChange(new Date(e.target.value).getTime())} />
    </label>
  )
}

export function SheetButtons({
  onCancel, primaryLabel, onPrimary,
}: { onCancel: () => void; primaryLabel: string; onPrimary: () => void }) {
  return (
    <div className="sheet-actions">
      <button className="btn-ghost" onClick={onCancel}>Cancel</button>
      <button className="btn-primary" onClick={onPrimary}>{primaryLabel}</button>
    </div>
  )
}

export interface FormProps { onClose: () => void; onSaved: () => void }
```

- [ ] **Step 2: Write the failing test for `DiaperForm` (simple manual entry)**

`src/components/home/forms/DiaperForm.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { DbProvider, type WorkerExecutor } from '../../../db/client'
import { makeTestExecutor } from '../../../db/testExecutor'
import { listEntries } from '../../../db/queries'
import { DiaperForm } from './DiaperForm'

let exec: WorkerExecutor
beforeEach(async () => {
  const base = await makeTestExecutor()
  exec = Object.assign(base, { exportBytes: async () => new Uint8Array(), importBytes: async () => {} }) as WorkerExecutor
})
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DbProvider, { executor: exec, children })

describe('DiaperForm', () => {
  it('saves a diaper entry with the chosen kind', async () => {
    const onSaved = vi.fn()
    render(<DiaperForm onClose={() => {}} onSaved={onSaved} />, { wrapper })
    await userEvent.click(screen.getByRole('button', { name: 'dirty' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const rows = await listEntries(exec, { type: 'diaper' })
    expect(rows).toHaveLength(1)
    expect(rows[0].diaper_kind).toBe('dirty')
    expect(onSaved).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/components/home/forms/DiaperForm.test.tsx`
Expected: FAIL — cannot find module `./DiaperForm`.

- [ ] **Step 4: Implement the forms**

`src/components/home/forms/DiaperForm.tsx`:
```tsx
import { useState } from 'react'
import { useDb } from '../../../db/client'
import { insertEntry } from '../../../db/queries'
import type { DiaperKind } from '../../../db/types'
import { Toggle, TimeField, SheetButtons, type FormProps } from './formKit'

const empty = {
  end_ts: null, side: null, amount_ml: null, milk_type: null, food: null,
  med_name: null, med_dose: null, note: null, photo_id: null,
}

export function DiaperForm({ onClose, onSaved }: FormProps) {
  const db = useDb()
  const [kind, setKind] = useState<DiaperKind>('wet')
  const [ts, setTs] = useState(Date.now())
  async function save() {
    await insertEntry(db, { type: 'diaper', start_ts: ts, diaper_kind: kind, ...empty })
    onSaved()
  }
  return (
    <div>
      <h4>Diaper</h4>
      <Toggle options={[{ value: 'wet', label: 'wet' }, { value: 'dirty', label: 'dirty' }, { value: 'both', label: 'both' }]} value={kind} onChange={setKind} />
      <TimeField value={ts} onChange={setTs} />
      <SheetButtons onCancel={onClose} primaryLabel="Save" onPrimary={save} />
    </div>
  )
}
```

`src/components/home/forms/BreastForm.tsx` (timer with manual fallback):
```tsx
import { useState } from 'react'
import { useDb } from '../../../db/client'
import { insertEntry, startTimer } from '../../../db/queries'
import { useActiveTimer } from '../../../state/useActiveTimer'
import { formatElapsed } from '../../../lib/timer'
import type { Side } from '../../../db/types'
import { Toggle, Stepper, TimeField, SheetButtons, type FormProps } from './formKit'

const empty = {
  amount_ml: null, milk_type: null, food: null, diaper_kind: null,
  med_name: null, med_dose: null, note: null, photo_id: null,
}

export function BreastForm({ onClose, onSaved }: FormProps) {
  const db = useDb()
  const { timer, elapsed, refresh } = useActiveTimer()
  const [side, setSide] = useState<Side>('L')
  const [manual, setManual] = useState(false)
  const [minutes, setMinutes] = useState(15)
  const [ts, setTs] = useState(Date.now())
  const running = timer?.type === 'breast'

  async function start() {
    await startTimer(db, { type: 'breast', start_ts: Date.now(), side })
    await refresh()
    onSaved() // closes; banner on Home shows running timer
  }
  async function saveManual() {
    const start = ts
    await insertEntry(db, { type: 'breast', start_ts: start, end_ts: start + minutes * 60_000, side, ...empty })
    onSaved()
  }

  return (
    <div>
      <h4>Breastfeed</h4>
      <Toggle options={[{ value: 'L', label: 'Left' }, { value: 'R', label: 'Right' }, { value: 'both', label: 'Both' }]} value={side} onChange={setSide} />
      {running ? (
        <div className="timer-display">● running {formatElapsed(elapsed)} (stop from Home)</div>
      ) : !manual ? (
        <>
          <button className="btn-start" onClick={start}>Start timer</button>
          <button className="btn-link" onClick={() => setManual(true)}>Enter manually</button>
        </>
      ) : (
        <>
          <Stepper label="duration" value={minutes} step={1} min={1} unit="min" onChange={setMinutes} />
          <TimeField value={ts} onChange={setTs} />
          <SheetButtons onCancel={onClose} primaryLabel="Save" onPrimary={saveManual} />
        </>
      )}
    </div>
  )
}
```

`src/components/home/forms/SleepForm.tsx` — identical shape to `BreastForm` but `type: 'sleep'`, no side toggle, manual fields are start `TimeField` + duration `Stepper`:
```tsx
import { useState } from 'react'
import { useDb } from '../../../db/client'
import { insertEntry, startTimer } from '../../../db/queries'
import { useActiveTimer } from '../../../state/useActiveTimer'
import { formatElapsed } from '../../../lib/timer'
import { Stepper, TimeField, SheetButtons, type FormProps } from './formKit'

const empty = {
  side: null, amount_ml: null, milk_type: null, food: null, diaper_kind: null,
  med_name: null, med_dose: null, note: null, photo_id: null,
}

export function SleepForm({ onClose, onSaved }: FormProps) {
  const db = useDb()
  const { timer, elapsed, refresh } = useActiveTimer()
  const [manual, setManual] = useState(false)
  const [minutes, setMinutes] = useState(45)
  const [ts, setTs] = useState(Date.now())
  const running = timer?.type === 'sleep'

  async function start() {
    await startTimer(db, { type: 'sleep', start_ts: Date.now(), side: null })
    await refresh()
    onSaved()
  }
  async function saveManual() {
    await insertEntry(db, { type: 'sleep', start_ts: ts, end_ts: ts + minutes * 60_000, ...empty })
    onSaved()
  }
  return (
    <div>
      <h4>Sleep</h4>
      {running ? (
        <div className="timer-display">● running {formatElapsed(elapsed)} (stop from Home)</div>
      ) : !manual ? (
        <>
          <button className="btn-start" onClick={start}>Start timer</button>
          <button className="btn-link" onClick={() => setManual(true)}>Enter manually</button>
        </>
      ) : (
        <>
          <Stepper label="duration" value={minutes} step={5} min={5} unit="min" onChange={setMinutes} />
          <TimeField value={ts} onChange={setTs} />
          <SheetButtons onCancel={onClose} primaryLabel="Save" onPrimary={saveManual} />
        </>
      )}
    </div>
  )
}
```

`src/components/home/forms/BottleForm.tsx`:
```tsx
import { useState } from 'react'
import { useDb } from '../../../db/client'
import { insertEntry } from '../../../db/queries'
import type { MilkType } from '../../../db/types'
import { Toggle, Stepper, TimeField, SheetButtons, type FormProps } from './formKit'

const empty = {
  end_ts: null, side: null, food: null, diaper_kind: null,
  med_name: null, med_dose: null, note: null, photo_id: null,
}

export function BottleForm({ onClose, onSaved }: FormProps) {
  const db = useDb()
  const [ml, setMl] = useState(90)
  const [milk, setMilk] = useState<MilkType>('breast')
  const [ts, setTs] = useState(Date.now())
  async function save() {
    await insertEntry(db, { type: 'bottle', start_ts: ts, amount_ml: ml, milk_type: milk, ...empty })
    onSaved()
  }
  return (
    <div>
      <h4>Bottle</h4>
      <Toggle options={[{ value: 'breast', label: 'Breast milk' }, { value: 'formula', label: 'Formula' }]} value={milk} onChange={setMilk} />
      <Stepper label="amount" value={ml} step={10} min={10} unit="ml" onChange={setMl} />
      <TimeField value={ts} onChange={setTs} />
      <SheetButtons onCancel={onClose} primaryLabel="Save" onPrimary={save} />
    </div>
  )
}
```

`src/components/home/forms/SolidsForm.tsx`:
```tsx
import { useState } from 'react'
import { useDb } from '../../../db/client'
import { insertEntry } from '../../../db/queries'
import { TimeField, SheetButtons, type FormProps } from './formKit'

const empty = {
  end_ts: null, side: null, amount_ml: null, milk_type: null, diaper_kind: null,
  med_name: null, med_dose: null, note: null, photo_id: null,
}

export function SolidsForm({ onClose, onSaved }: FormProps) {
  const db = useDb()
  const [food, setFood] = useState('')
  const [ts, setTs] = useState(Date.now())
  async function save() {
    await insertEntry(db, { type: 'solids', start_ts: ts, food: food.trim() || null, ...empty })
    onSaved()
  }
  return (
    <div>
      <h4>Solids</h4>
      <input className="text-input" placeholder="What did they eat?" value={food} onChange={(e) => setFood(e.target.value)} />
      <TimeField value={ts} onChange={setTs} />
      <SheetButtons onCancel={onClose} primaryLabel="Save" onPrimary={save} />
    </div>
  )
}
```

`src/components/home/forms/MedsForm.tsx`:
```tsx
import { useState } from 'react'
import { useDb } from '../../../db/client'
import { insertEntry } from '../../../db/queries'
import { TimeField, SheetButtons, type FormProps } from './formKit'

const empty = {
  end_ts: null, side: null, amount_ml: null, milk_type: null, food: null,
  diaper_kind: null, note: null, photo_id: null,
}

export function MedsForm({ onClose, onSaved }: FormProps) {
  const db = useDb()
  const [name, setName] = useState('')
  const [dose, setDose] = useState('')
  const [ts, setTs] = useState(Date.now())
  async function save() {
    await insertEntry(db, { type: 'meds', start_ts: ts, med_name: name.trim() || null, med_dose: dose.trim() || null, ...empty })
    onSaved()
  }
  return (
    <div>
      <h4>Meds / Vitamins</h4>
      <input className="text-input" placeholder="Name (e.g. Vitamin D)" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="text-input" placeholder="Dose (e.g. 1 drop)" value={dose} onChange={(e) => setDose(e.target.value)} />
      <TimeField value={ts} onChange={setTs} />
      <SheetButtons onCancel={onClose} primaryLabel="Save" onPrimary={save} />
    </div>
  )
}
```

`src/components/home/forms/NoteForm.tsx`:
```tsx
import { useState } from 'react'
import { useDb } from '../../../db/client'
import { insertEntry } from '../../../db/queries'
import { TimeField, SheetButtons, type FormProps } from './formKit'

const empty = {
  end_ts: null, side: null, amount_ml: null, milk_type: null, food: null,
  diaper_kind: null, med_name: null, med_dose: null, photo_id: null,
}

export function NoteForm({ onClose, onSaved }: FormProps) {
  const db = useDb()
  const [note, setNote] = useState('')
  const [ts, setTs] = useState(Date.now())
  async function save() {
    if (!note.trim()) return
    await insertEntry(db, { type: 'note', start_ts: ts, note: note.trim(), ...empty })
    onSaved()
  }
  return (
    <div>
      <h4>Note</h4>
      <textarea className="text-input" rows={3} placeholder="Anything to remember…" value={note} onChange={(e) => setNote(e.target.value)} />
      <TimeField value={ts} onChange={setTs} />
      <SheetButtons onCancel={onClose} primaryLabel="Save" onPrimary={save} />
    </div>
  )
}
```

- [ ] **Step 5: Implement `LogSheet.tsx`**

```tsx
import type { LogTarget } from './QuickLogGrid'
import { BreastForm } from './forms/BreastForm'
import { BottleForm } from './forms/BottleForm'
import { SleepForm } from './forms/SleepForm'
import { SolidsForm } from './forms/SolidsForm'
import { DiaperForm } from './forms/DiaperForm'
import { MedsForm } from './forms/MedsForm'
import { NoteForm } from './forms/NoteForm'
import { MeasureForm } from '../growth/MeasureForm'
import type { FormProps } from './forms/formKit'

const FORMS: Record<string, (p: FormProps) => JSX.Element> = {
  breast: BreastForm, bottle: BottleForm, sleep: SleepForm, solids: SolidsForm,
  diaper: DiaperForm, meds: MedsForm, note: NoteForm,
}

export function LogSheet({
  target, onClose, onSaved,
}: {
  target: LogTarget | 'note' | null
  onClose: () => void
  onSaved: () => void
}) {
  if (!target) return null
  const Form =
    target === 'measure' || target === 'temperature'
      ? (p: FormProps) => <MeasureForm {...p} initialType={target === 'temperature' ? 'temperature' : 'weight'} />
      : FORMS[target]
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {Form && <Form onClose={onClose} onSaved={onSaved} />}
      </div>
    </div>
  )
}
```

> `MeasureForm` is created in Task 11. If implementing strictly in order, stub it as a component that renders `null` now and replace in Task 11; the import path stays the same.

- [ ] **Step 6: Add sheet styles to `theme.css`**

```css
.sheet-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: flex-end; z-index: 50; }
.sheet { width: 100%; background: var(--surface); border-radius: 22px 22px 0 0; padding: 16px 16px calc(20px + env(safe-area-inset-bottom)); }
.sheet h4 { margin: 4px 0 14px; }
.grab { width: 38px; height: 4px; background: #3a3f4a; border-radius: 3px; margin: 0 auto 14px; }
.toggle { display: flex; gap: 8px; margin-bottom: 14px; }
.toggle .opt { flex: 1; padding: 10px 0; border: 0; border-radius: 11px; background: var(--surface-2); color: var(--text); font-weight: 600; }
.toggle .opt.on { background: var(--accent); }
.stepper { display: flex; align-items: center; justify-content: space-between; background: var(--surface-2); border-radius: 11px; padding: 8px 14px; margin-bottom: 12px; }
.stepper .pm { width: 32px; height: 32px; border: 0; border-radius: 50%; background: var(--accent); color: #fff; font-size: 18px; }
.stepper .mid { text-align: center; } .stepper .mid b { display: block; } .stepper .mid span { font-size: 10px; color: var(--muted); }
.timefield { display: flex; justify-content: space-between; align-items: center; background: var(--surface-2); border-radius: 11px; padding: 10px 14px; margin-bottom: 14px; }
.timefield input, .text-input { background: none; border: 0; color: var(--text); font: inherit; }
.text-input { width: 100%; background: var(--surface-2); border-radius: 11px; padding: 11px 14px; margin-bottom: 12px; }
.sheet-actions { display: flex; gap: 10px; }
.btn-primary { flex: 1; background: var(--accent); color: #fff; border: 0; border-radius: 13px; padding: 13px; font-weight: 700; }
.btn-ghost { flex: 1; background: var(--surface-2); color: var(--text); border: 0; border-radius: 13px; padding: 13px; }
.btn-start { width: 100%; background: var(--green); color: #fff; border: 0; border-radius: 13px; padding: 14px; font-weight: 700; margin-bottom: 10px; }
.btn-link { display: block; width: 100%; background: none; border: 0; color: var(--muted); padding: 6px; }
.timer-display { text-align: center; padding: 12px; color: var(--green); font-weight: 600; }
```

- [ ] **Step 7: Own sheet state in `App.tsx`**

```tsx
import { useState } from 'react'
import { BottomTabs, type TabId } from './components/BottomTabs'
import { Home } from './components/home/Home'
import { LogSheet } from './components/home/LogSheet'
import type { LogTarget } from './components/home/QuickLogGrid'

export default function App() {
  const [tab, setTab] = useState<TabId>('home')
  const [target, setTarget] = useState<LogTarget | 'note' | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  return (
    <div className="app">
      <main className="app-main">
        {tab === 'home' && (
          <Home key={refreshKey} onLog={setTarget} onSelectEntry={() => {}} />
        )}
        {tab !== 'home' && <h2 style={{ textTransform: 'capitalize' }}>{tab}</h2>}
      </main>
      <BottomTabs active={tab} onChange={setTab} />
      <LogSheet
        target={target}
        onClose={() => setTarget(null)}
        onSaved={() => { setTarget(null); setRefreshKey((k) => k + 1) }}
      />
    </div>
  )
}
```

- [ ] **Step 8: Write the failing test for `BreastForm` start-timer path**

`src/components/home/forms/BreastForm.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { DbProvider, type WorkerExecutor } from '../../../db/client'
import { makeTestExecutor } from '../../../db/testExecutor'
import { getActiveTimer } from '../../../db/queries'
import { BreastForm } from './BreastForm'

let exec: WorkerExecutor
beforeEach(async () => {
  const base = await makeTestExecutor()
  exec = Object.assign(base, { exportBytes: async () => new Uint8Array(), importBytes: async () => {} }) as WorkerExecutor
})
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DbProvider, { executor: exec, children })

describe('BreastForm', () => {
  it('starts a timer on the selected side', async () => {
    render(<BreastForm onClose={() => {}} onSaved={() => {}} />, { wrapper })
    await userEvent.click(screen.getByRole('button', { name: 'Right' }))
    await userEvent.click(screen.getByRole('button', { name: 'Start timer' }))
    const t = await getActiveTimer(exec)
    expect(t?.type).toBe('breast')
    expect(t?.side).toBe('R')
  })

  it('saves a manual breastfeed with duration', async () => {
    const onSaved = vi.fn()
    render(<BreastForm onClose={() => {}} onSaved={onSaved} />, { wrapper })
    await userEvent.click(screen.getByRole('button', { name: 'Enter manually' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSaved).toHaveBeenCalled()
  })
})
```

- [ ] **Step 9: Run all form tests**

Run: `npx vitest run src/components/home/forms/`
Expected: PASS (DiaperForm + BreastForm). If `MeasureForm` import fails because Task 11 isn't done, add the temporary stub described in Step 5.

- [ ] **Step 10: Commit**

```bash
git add src/components/home/forms src/components/home/LogSheet.tsx src/App.tsx src/styles/theme.css
git commit -m "feat: add log sheet and entry forms with timer and manual fallback"
```

---

## Task 11: Growth tab — measurements, SVG chart, measure form

**Files:**
- Create: `src/components/growth/LineChart.tsx`
- Create: `src/components/growth/MeasureForm.tsx`
- Create: `src/components/growth/Growth.tsx`
- Create: `src/components/growth/chartGeometry.ts` (pure: maps points to SVG coords)
- Modify: `src/App.tsx` (render `Growth` on the growth tab)
- Modify: `src/styles/theme.css` (chart styles)
- Test: `src/components/growth/chartGeometry.test.ts`, `src/components/growth/MeasureForm.test.tsx`

**Interfaces:**
- Consumes: `useDb`, `insertMeasurement`, `listMeasurements`, `deleteMeasurement`, unit conversions, `getSetting`.
- Produces:
  - `chartGeometry(points: {x:number;y:number}[], width:number, height:number, pad:number): { path: string; dots: {cx:number;cy:number}[] }`.
  - `LineChart({ points, width?, height? })`.
  - `MeasureForm({ onClose, onSaved, initialType }: FormProps & { initialType: MeasurementType })` — converts the typed display value to canonical units before storing.
  - `Growth()` — type selector (weight/height/head/temperature), chart, latest value, list with delete.

- [ ] **Step 1: Write the failing test for `chartGeometry`**

`src/components/growth/chartGeometry.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { chartGeometry } from './chartGeometry'

describe('chartGeometry', () => {
  it('maps points into padded SVG space with y inverted', () => {
    const { path, dots } = chartGeometry(
      [{ x: 0, y: 0 }, { x: 10, y: 10 }], 100, 100, 10,
    )
    // x: 0->pad(10), 10->width-pad(90); y inverted: 0->height-pad(90), 10->pad(10)
    expect(dots).toEqual([{ cx: 10, cy: 90 }, { cx: 90, cy: 10 }])
    expect(path).toBe('M 10 90 L 90 10')
  })

  it('handles a single point (flat line at vertical center)', () => {
    const { dots } = chartGeometry([{ x: 5, y: 5 }], 100, 100, 10)
    expect(dots).toHaveLength(1)
    expect(dots[0].cx).toBe(10)
    expect(dots[0].cy).toBe(50)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/growth/chartGeometry.test.ts`
Expected: FAIL — cannot find module `./chartGeometry`.

- [ ] **Step 3: Implement `chartGeometry.ts`**

```ts
export function chartGeometry(
  points: { x: number; y: number }[],
  width: number,
  height: number,
  pad: number,
): { path: string; dots: { cx: number; cy: number }[] } {
  if (points.length === 0) return { path: '', dots: [] }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1
  const innerW = width - pad * 2
  const innerH = height - pad * 2
  const dots = points.map((p) => ({
    cx: pad + (points.length === 1 ? 0 : ((p.x - minX) / spanX) * innerW),
    cy: points.length === 1 ? height / 2 : pad + innerH - ((p.y - minY) / spanY) * innerH,
  }))
  const path = dots
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${d.cx} ${d.cy}`)
    .join(' ')
  return { path, dots }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/growth/chartGeometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `LineChart.tsx`**

```tsx
import { chartGeometry } from './chartGeometry'

export function LineChart({
  points, width = 320, height = 180,
}: {
  points: { x: number; y: number }[]
  width?: number
  height?: number
}) {
  const { path, dots } = chartGeometry(points, width, height, 16)
  if (points.length === 0) return <p className="muted">No measurements yet.</p>
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} width="100%">
      {path && <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} />}
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={i === dots.length - 1 ? 5 : 3} fill="var(--accent)" />
      ))}
    </svg>
  )
}
```

- [ ] **Step 6: Write the failing test for `MeasureForm`**

`src/components/growth/MeasureForm.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { DbProvider, type WorkerExecutor } from '../../db/client'
import { makeTestExecutor } from '../../db/testExecutor'
import { listMeasurements, setSetting } from '../../db/queries'
import { MeasureForm } from './MeasureForm'

let exec: WorkerExecutor
beforeEach(async () => {
  const base = await makeTestExecutor()
  exec = Object.assign(base, { exportBytes: async () => new Uint8Array(), importBytes: async () => {} }) as WorkerExecutor
})
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DbProvider, { executor: exec, children })

describe('MeasureForm', () => {
  it('stores weight in canonical grams from a kg input', async () => {
    await setSetting(exec, 'units_weight', 'kg')
    const onSaved = vi.fn()
    render(<MeasureForm onClose={() => {}} onSaved={onSaved} initialType="weight" />, { wrapper })
    const input = await screen.findByLabelText(/value/i)
    await userEvent.clear(input)
    await userEvent.type(input, '5.2')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const rows = await listMeasurements(exec, 'weight')
    expect(rows[0].value).toBe(5200)
    expect(onSaved).toHaveBeenCalled()
  })
})
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/components/growth/MeasureForm.test.tsx`
Expected: FAIL — cannot find module `./MeasureForm`.

- [ ] **Step 8: Implement `MeasureForm.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useDb } from '../../db/client'
import { insertMeasurement, getSetting } from '../../db/queries'
import type { MeasurementType } from '../../db/types'
import { kgToG, cmToMm, inToMm, fToC, round1 } from '../../lib/units'
import { TimeField, SheetButtons, type FormProps } from '../home/forms/formKit'

const TYPES: { value: MeasurementType; label: string }[] = [
  { value: 'weight', label: 'Weight' },
  { value: 'height', label: 'Height' },
  { value: 'head', label: 'Head' },
  { value: 'temperature', label: 'Temp' },
]

function toCanonical(type: MeasurementType, value: number, units: Record<string, string>): number {
  if (type === 'weight') return units.weight === 'lb' ? Math.round(value * 453.59237) : kgToG(value)
  if (type === 'temperature') return units.temp === 'F' ? round1(fToC(value)) : value
  // height/head
  return units.length === 'in' ? Math.round(inToMm(value)) : cmToMm(value)
}

export function MeasureForm({ onClose, onSaved, initialType }: FormProps & { initialType: MeasurementType }) {
  const db = useDb()
  const [type, setType] = useState<MeasurementType>(initialType)
  const [raw, setRaw] = useState('')
  const [ts, setTs] = useState(Date.now())
  const [units, setUnits] = useState<Record<string, string>>({ weight: 'kg', length: 'cm', temp: 'C' })

  useEffect(() => {
    void (async () => {
      setUnits({
        weight: (await getSetting(db, 'units_weight')) ?? 'kg',
        length: (await getSetting(db, 'units_length')) ?? 'cm',
        temp: (await getSetting(db, 'units_temp')) ?? 'C',
      })
    })()
  }, [db])

  async function save() {
    const num = parseFloat(raw)
    if (Number.isNaN(num)) return
    await insertMeasurement(db, { type, ts, value: toCanonical(type, num, units), note: null })
    onSaved()
  }

  const unitLabel = type === 'weight' ? units.weight : type === 'temperature' ? `°${units.temp}` : units.length

  return (
    <div>
      <h4>Add measurement</h4>
      <div className="toggle">
        {TYPES.map((t) => (
          <button key={t.value} className={`opt ${t.value === type ? 'on' : ''}`} onClick={() => setType(t.value)}>{t.label}</button>
        ))}
      </div>
      <label className="timefield">
        <span>Value ({unitLabel})</span>
        <input aria-label="value" inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value)} />
      </label>
      <TimeField value={ts} onChange={setTs} />
      <SheetButtons onCancel={onClose} primaryLabel="Save" onPrimary={save} />
    </div>
  )
}
```

- [ ] **Step 9: Implement `Growth.tsx` and chart styles**

`src/components/growth/Growth.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { useDb } from '../../db/client'
import { listMeasurements, deleteMeasurement, getSetting } from '../../db/queries'
import type { Measurement, MeasurementType } from '../../db/types'
import { gToKg, gToLbOz, mmToCm, mmToIn, cToF, round1 } from '../../lib/units'
import { formatClock } from '../../lib/time'
import { LineChart } from './LineChart'

const TYPES: { value: MeasurementType; label: string }[] = [
  { value: 'weight', label: 'Weight' },
  { value: 'height', label: 'Height' },
  { value: 'head', label: 'Head' },
  { value: 'temperature', label: 'Temp' },
]

function display(type: MeasurementType, value: number, units: Record<string, string>): string {
  if (type === 'weight') return units.weight === 'lb'
    ? (() => { const { lb, oz } = gToLbOz(value); return `${lb}lb ${oz}oz` })()
    : `${gToKg(value)} kg`
  if (type === 'temperature') return units.temp === 'F' ? `${cToF(value)}°F` : `${round1(value)}°C`
  return units.length === 'in' ? `${round1(mmToIn(value))} in` : `${mmToCm(value)} cm`
}

export function Growth() {
  const db = useDb()
  const [type, setType] = useState<MeasurementType>('weight')
  const [rows, setRows] = useState<Measurement[]>([])
  const [units, setUnits] = useState<Record<string, string>>({ weight: 'kg', length: 'cm', temp: 'C' })

  async function reload() {
    setRows(await listMeasurements(db, type))
  }
  useEffect(() => { void reload() }, [db, type])
  useEffect(() => {
    void (async () => setUnits({
      weight: (await getSetting(db, 'units_weight')) ?? 'kg',
      length: (await getSetting(db, 'units_length')) ?? 'cm',
      temp: (await getSetting(db, 'units_temp')) ?? 'C',
    }))()
  }, [db])

  const points = rows.map((m) => ({ x: m.ts, y: m.value }))
  const latest = rows[rows.length - 1]

  return (
    <div>
      <div className="toggle">
        {TYPES.map((t) => (
          <button key={t.value} className={`opt ${t.value === type ? 'on' : ''}`} onClick={() => setType(t.value)}>{t.label}</button>
        ))}
      </div>
      {latest && <p className="latest">Latest: <b>{display(type, latest.value, units)}</b></p>}
      <LineChart points={points} />
      <div className="tl">
        {rows.slice().reverse().map((m) => (
          <div key={m.id} className="row">
            <span className="tm">{new Date(m.ts).toLocaleDateString()}</span>
            <span>{display(type, m.value, units)}</span>
            <button className="btn-link" style={{ width: 'auto', marginLeft: 'auto' }}
              onClick={async () => { await deleteMeasurement(db, m.id); await reload() }}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

Add to `theme.css`:
```css
.chart { background: var(--surface); border-radius: var(--radius); margin: 8px 0 14px; }
.latest { margin: 8px 2px; } .latest b { font-size: 18px; }
```

- [ ] **Step 10: Wire `Growth` into `App.tsx`**

In `App.tsx`, import `Growth` and render it for the growth tab:
```tsx
import { Growth } from './components/growth/Growth'
// ...
{tab === 'growth' && <Growth />}
{tab !== 'home' && tab !== 'growth' && <h2 style={{ textTransform: 'capitalize' }}>{tab}</h2>}
```
Also add a "More" affordance on Home for measure/temperature/note: extend `QuickLogGrid`'s `BUTTONS` is not desired (keeps 6 primary). Instead add a secondary row under the grid in `Home.tsx`:
```tsx
<div className="more-row">
  <button className="btn-link" onClick={() => onLog('measure')}>📏 Measure</button>
  <button className="btn-link" onClick={() => onLog('temperature')}>🌡️ Temp</button>
  <button className="btn-link" onClick={() => onLog('note')}>📝 Note</button>
</div>
```
And in `App.tsx`, `Home`'s `onLog` already routes any `LogTarget | 'note'` to the sheet. Add `.more-row { display:flex; gap:8px; margin-bottom:14px; } .more-row .btn-link { width:auto; }` to `theme.css`.

- [ ] **Step 11: Run growth tests and full suite**

Run: `npx vitest run src/components/growth/ && npm test`
Expected: PASS across all files. `npx tsc -b` clean.

- [ ] **Step 12: Commit**

```bash
git add src/components/growth src/App.tsx src/components/home/Home.tsx src/styles/theme.css
git commit -m "feat: add Growth tab with SVG charts, measurement form, and unit-aware display"
```

---

## Task 12: History tab — list, filter, edit & delete

**Files:**
- Create: `src/components/history/History.tsx`
- Create: `src/components/history/EditEntrySheet.tsx`
- Modify: `src/App.tsx` (render `History`; route timeline taps to the edit sheet)
- Modify: `src/styles/theme.css`
- Test: `src/components/history/History.test.tsx`

**Interfaces:**
- Consumes: `useDb`, `listEntries`, `updateEntry`, `deleteEntry`, `entryLabel`, `formatClock`.
- Produces:
  - `History({ onEdit }: { onEdit: (e: Entry) => void })` — entries grouped by day, a type filter (`all` + each `EntryType`).
  - `EditEntrySheet({ entry, onClose, onChanged })` — edit `start_ts`/`end_ts`/`note` and delete (with confirm).

- [ ] **Step 1: Write the failing test**

`src/components/history/History.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { DbProvider, type WorkerExecutor } from '../../db/client'
import { makeTestExecutor } from '../../db/testExecutor'
import { insertEntry } from '../../db/queries'
import { History } from './History'

let exec: WorkerExecutor
beforeEach(async () => {
  const base = await makeTestExecutor()
  exec = Object.assign(base, { exportBytes: async () => new Uint8Array(), importBytes: async () => {} }) as WorkerExecutor
})
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DbProvider, { executor: exec, children })

const mk = (over = {}) => ({
  type: 'breast' as const, start_ts: Date.now(), end_ts: null, side: 'L' as const,
  amount_ml: null, milk_type: null, food: null, diaper_kind: null,
  med_name: null, med_dose: null, note: null, photo_id: null, ...over,
})

describe('History', () => {
  it('lists all entries and filters by type', async () => {
    await insertEntry(exec, mk())
    await insertEntry(exec, mk({ type: 'diaper', side: null, diaper_kind: 'wet' }))
    render(<History onEdit={() => {}} />, { wrapper })
    await waitFor(() => expect(screen.getByText(/Breast/)).toBeInTheDocument())
    expect(screen.getByText(/Diaper/)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText(/filter/i), 'diaper')
    await waitFor(() => expect(screen.queryByText(/Breast/)).not.toBeInTheDocument())
    expect(screen.getByText(/Diaper/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/history/History.test.tsx`
Expected: FAIL — cannot find module `./History`.

- [ ] **Step 3: Implement `History.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useDb } from '../../db/client'
import { listEntries } from '../../db/queries'
import type { Entry, EntryType } from '../../db/types'
import { entryLabel } from '../home/entryLabel'
import { formatClock } from '../../lib/time'

const FILTERS: ('all' | EntryType)[] = ['all', 'breast', 'bottle', 'solids', 'sleep', 'diaper', 'meds', 'note']

function dayKey(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function History({ onEdit }: { onEdit: (e: Entry) => void }) {
  const db = useDb()
  const [filter, setFilter] = useState<'all' | EntryType>('all')
  const [rows, setRows] = useState<Entry[]>([])

  useEffect(() => {
    void (async () => setRows(await listEntries(db, filter === 'all' ? {} : { type: filter })))()
  }, [db, filter])

  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const e of rows) {
      const k = dayKey(e.start_ts)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(e)
    }
    return [...map.entries()]
  }, [rows])

  return (
    <div>
      <label className="filter-row">
        <span className="sectlbl">Filter</span>
        <select aria-label="filter" value={filter} onChange={(e) => setFilter(e.target.value as 'all' | EntryType)}>
          {FILTERS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>
      {groups.length === 0 && <p className="muted">No entries.</p>}
      {groups.map(([day, items]) => (
        <div key={day}>
          <div className="sectlbl">{day}</div>
          <div className="tl">
            {items.map((e) => {
              const { icon, text } = entryLabel(e)
              return (
                <button key={e.id} className="row" onClick={() => onEdit(e)}>
                  <span className="tm">{formatClock(e.start_ts)}</span>
                  <span className="dot">{icon}</span>
                  <span>{text}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Implement `EditEntrySheet.tsx`**

```tsx
import { useState } from 'react'
import { useDb } from '../../db/client'
import { updateEntry, deleteEntry } from '../../db/queries'
import type { Entry } from '../../db/types'
import { TimeField, SheetButtons } from '../home/forms/formKit'
import { entryLabel } from '../home/entryLabel'

export function EditEntrySheet({
  entry, onClose, onChanged,
}: {
  entry: Entry | null
  onClose: () => void
  onChanged: () => void
}) {
  if (!entry) return null
  return <EditBody entry={entry} onClose={onClose} onChanged={onChanged} />
}

function EditBody({ entry, onClose, onChanged }: { entry: Entry; onClose: () => void; onChanged: () => void }) {
  const db = useDb()
  const [start, setStart] = useState(entry.start_ts)
  const [end, setEnd] = useState<number | null>(entry.end_ts)
  const [note, setNote] = useState(entry.note ?? '')

  async function save() {
    await updateEntry(db, entry.id, { start_ts: start, end_ts: end, note: note.trim() || null })
    onChanged()
  }
  async function remove() {
    if (!confirm('Delete this entry?')) return
    await deleteEntry(db, entry.id)
    onChanged()
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h4>Edit · {entryLabel(entry).text}</h4>
        <div className="sectlbl">Start</div>
        <TimeField value={start} onChange={setStart} />
        {entry.end_ts != null && (
          <>
            <div className="sectlbl">End</div>
            <TimeField value={end ?? entry.end_ts} onChange={setEnd} />
          </>
        )}
        <textarea className="text-input" rows={2} placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <SheetButtons onCancel={onClose} primaryLabel="Save" onPrimary={save} />
        <button className="btn-danger" onClick={remove}>Delete</button>
      </div>
    </div>
  )
}
```

Add to `theme.css`:
```css
.filter-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.filter-row select { background: var(--surface-2); color: var(--text); border: 0; border-radius: 10px; padding: 8px 10px; }
.btn-danger { width: 100%; margin-top: 10px; background: none; border: 1px solid var(--danger); color: var(--danger); border-radius: 13px; padding: 12px; }
```

- [ ] **Step 5: Wire into `App.tsx`**

Add edit-sheet state and route both Home timeline taps and History taps to it:
```tsx
import { History } from './components/history/History'
import { EditEntrySheet } from './components/history/EditEntrySheet'
import type { Entry } from './db/types'
// inside App component state:
const [editing, setEditing] = useState<Entry | null>(null)
// render:
{tab === 'history' && <History key={refreshKey} onEdit={setEditing} />}
// Home's onSelectEntry -> setEditing
// replace the settings placeholder line accordingly
<EditEntrySheet
  entry={editing}
  onClose={() => setEditing(null)}
  onChanged={() => { setEditing(null); setRefreshKey((k) => k + 1) }}
/>
```
Update the Home render line to `onSelectEntry={setEditing}` and the placeholder condition to only cover `settings`.

- [ ] **Step 6: Run history tests and full suite**

Run: `npx vitest run src/components/history/ && npm test`
Expected: PASS. `npx tsc -b` clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/history src/App.tsx src/styles/theme.css
git commit -m "feat: add History tab with day grouping, type filter, and edit/delete sheet"
```

---

## Task 13: Settings tab — profile, units, button visibility, backup/export

**Files:**
- Create: `src/components/settings/Settings.tsx`
- Create: `src/components/settings/ProfileSection.tsx`
- Create: `src/components/settings/UnitsSection.tsx`
- Create: `src/components/settings/BackupSection.tsx`
- Create: `src/lib/backup.ts` (pure-ish helpers: `downloadBytes`, `readFileBytes`, `exportFilename`)
- Modify: `src/App.tsx` (render `Settings`)
- Modify: `src/components/home/Home.tsx` (read baby name/DOB + visible buttons from settings — optional polish)
- Test: `src/lib/backup.test.ts`, `src/components/settings/UnitsSection.test.tsx`

**Interfaces:**
- Consumes: `useDb`, `getSetting`, `setSetting`, `WorkerExecutor.exportBytes/importBytes`, `ageLabel`.
- Produces:
  - `src/lib/backup.ts`: `exportFilename(now: number): string` → `babytracker-YYYY-MM-DD.db`; `downloadBytes(bytes, filename)`; `readFileBytes(file: File): Promise<Uint8Array>`.
  - `Settings()` composing the three sections.

- [ ] **Step 1: Write the failing test for `exportFilename`**

`src/lib/backup.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { exportFilename } from './backup'

describe('exportFilename', () => {
  it('formats the date into the filename', () => {
    const ts = new Date(2026, 5, 25, 14, 0, 0).getTime()
    expect(exportFilename(ts)).toBe('babytracker-2026-06-25.db')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/backup.test.ts`
Expected: FAIL — cannot find module `./backup`.

- [ ] **Step 3: Implement `src/lib/backup.ts`**

```ts
const pad = (n: number) => String(n).padStart(2, '0')

export function exportFilename(now: number): string {
  const d = new Date(now)
  return `babytracker-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.db`
}

export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes], { type: 'application/x-sqlite3' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the sections**

`src/components/settings/ProfileSection.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { useDb } from '../../db/client'
import { getSetting, setSetting } from '../../db/queries'
import { ageLabel } from '../../lib/time'

export function ProfileSection() {
  const db = useDb()
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')

  useEffect(() => {
    void (async () => {
      setName((await getSetting(db, 'baby_name')) ?? '')
      setDob((await getSetting(db, 'baby_dob')) ?? '')
    })()
  }, [db])

  const dobTs = dob ? new Date(dob).getTime() : null
  return (
    <section className="card-section">
      <h3>Baby</h3>
      <input className="text-input" placeholder="Name" value={name}
        onChange={(e) => { setName(e.target.value); void setSetting(db, 'baby_name', e.target.value) }} />
      <label className="timefield">
        <span>Date of birth</span>
        <input type="date" value={dob}
          onChange={(e) => { setDob(e.target.value); void setSetting(db, 'baby_dob', e.target.value) }} />
      </label>
      {dobTs && <p className="muted">Age: {ageLabel(dobTs, Date.now())}</p>}
    </section>
  )
}
```

`src/components/settings/UnitsSection.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { useDb } from '../../db/client'
import { getSetting, setSetting } from '../../db/queries'

const FIELDS: { key: string; label: string; options: string[] }[] = [
  { key: 'units_weight', label: 'Weight', options: ['kg', 'lb'] },
  { key: 'units_length', label: 'Length', options: ['cm', 'in'] },
  { key: 'units_temp', label: 'Temperature', options: ['C', 'F'] },
]

export function UnitsSection() {
  const db = useDb()
  const [vals, setVals] = useState<Record<string, string>>({})
  useEffect(() => {
    void (async () => {
      const out: Record<string, string> = {}
      for (const f of FIELDS) out[f.key] = (await getSetting(db, f.key)) ?? f.options[0]
      setVals(out)
    })()
  }, [db])

  async function change(key: string, value: string) {
    setVals((v) => ({ ...v, [key]: value }))
    await setSetting(db, key, value)
  }

  return (
    <section className="card-section">
      <h3>Units</h3>
      {FIELDS.map((f) => (
        <label key={f.key} className="filter-row">
          <span>{f.label}</span>
          <select aria-label={f.label} value={vals[f.key] ?? f.options[0]} onChange={(e) => change(f.key, e.target.value)}>
            {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      ))}
    </section>
  )
}
```

`src/components/settings/BackupSection.tsx`:
```tsx
import { useRef, useState } from 'react'
import { useDb } from '../../db/client'
import { exportFilename, downloadBytes, readFileBytes } from '../../lib/backup'

export function BackupSection() {
  const db = useDb()
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')

  async function doExport() {
    setStatus('Exporting…')
    const bytes = await db.exportBytes()
    downloadBytes(bytes, exportFilename(Date.now()))
    setStatus('Exported.')
  }
  async function doImport(file: File) {
    if (!confirm('Importing replaces ALL current data. Continue?')) return
    setStatus('Importing…')
    await db.importBytes(await readFileBytes(file))
    setStatus('Imported. Reload to see changes.')
  }

  return (
    <section className="card-section">
      <h3>Backup</h3>
      <button className="btn-primary" onClick={doExport}>Export database (.db)</button>
      <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => fileRef.current?.click()}>Import database</button>
      <input ref={fileRef} type="file" accept=".db,.sqlite3,application/x-sqlite3" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f) }} />
      {status && <p className="muted">{status}</p>}
    </section>
  )
}
```

`src/components/settings/Settings.tsx`:
```tsx
import { ProfileSection } from './ProfileSection'
import { UnitsSection } from './UnitsSection'
import { BackupSection } from './BackupSection'

export function Settings() {
  return (
    <div>
      <ProfileSection />
      <UnitsSection />
      <BackupSection />
    </div>
  )
}
```

Add to `theme.css`:
```css
.card-section { background: var(--surface); border-radius: var(--radius); padding: 14px; margin-bottom: 14px; }
.card-section h3 { margin: 0 0 12px; }
```

- [ ] **Step 6: Write the failing test for `UnitsSection`**

`src/components/settings/UnitsSection.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { DbProvider, type WorkerExecutor } from '../../db/client'
import { makeTestExecutor } from '../../db/testExecutor'
import { getSetting } from '../../db/queries'
import { UnitsSection } from './UnitsSection'

let exec: WorkerExecutor
beforeEach(async () => {
  const base = await makeTestExecutor()
  exec = Object.assign(base, { exportBytes: async () => new Uint8Array(), importBytes: async () => {} }) as WorkerExecutor
})
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DbProvider, { executor: exec, children })

describe('UnitsSection', () => {
  it('persists a unit change', async () => {
    render(<UnitsSection />, { wrapper })
    await waitFor(() => expect(screen.getByLabelText('Weight')).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText('Weight'), 'lb')
    await waitFor(async () => expect(await getSetting(exec, 'units_weight')).toBe('lb'))
  })
})
```

- [ ] **Step 7: Wire `Settings` into `App.tsx`, run full suite**

In `App.tsx` import `Settings` and render `{tab === 'settings' && <Settings />}`; remove the remaining placeholder `<h2>`.

Run: `npx vitest run src/components/settings/ src/lib/backup.test.ts && npm test`
Expected: PASS across all files. `npx tsc -b` clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/settings src/lib/backup.ts src/lib/backup.test.ts src/App.tsx src/styles/theme.css
git commit -m "feat: add Settings tab with profile, units, and backup/export-import"
```

---

## Task 14: PWA manifest, icons, service worker, and offline polish

**Files:**
- Modify: `vite.config.ts` (configure `vite-plugin-pwa`)
- Create: `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png` (placeholder PNGs; replace with real art later)
- Create: `src/pwa.ts` (registration + "update available" prompt)
- Modify: `src/main.tsx` (import `./pwa`)
- Modify: `src/components/settings/BackupSection.tsx` (export-reminder badge using a `last_export_ts` setting)
- Create: `docs/MANUAL-SMOKE-CHECKLIST.md`

**Interfaces:**
- Consumes: `vite-plugin-pwa` virtual module `virtual:pwa-register`.
- Produces: an installable, offline-capable build; a documented manual smoke test.

- [ ] **Step 1: Configure `vite-plugin-pwa`**

Update `vite.config.ts` to add the plugin:
```ts
import { VitePWA } from 'vite-plugin-pwa'
// inside plugins: [...]
VitePWA({
  registerType: 'prompt',
  includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
  manifest: {
    name: 'Baby Tracker',
    short_name: 'Baby',
    theme_color: '#0f1115',
    background_color: '#0f1115',
    display: 'standalone',
    orientation: 'portrait',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,wasm}'],
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  },
})
```

- [ ] **Step 2: Create placeholder icons**

Generate three solid-color PNG placeholders so the build has valid assets (replace with real artwork later):
```bash
node -e "const fs=require('fs');const b=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');for(const f of ['public/icon-192.png','public/icon-512.png','public/icon-maskable-512.png']){fs.mkdirSync('public',{recursive:true});fs.writeFileSync(f,b)}"
```
Expected: three files created under `public/`.

- [ ] **Step 3: Implement update-prompt registration**

`src/pwa.ts`:
```ts
import { registerSW } from 'virtual:pwa-register'

const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('Update available — reload now?')) updateSW(true)
  },
})
```

Add to `src/main.tsx` (top-level import, after other imports):
```ts
import './pwa'
```

- [ ] **Step 4: Add export-reminder badge**

In `BackupSection.tsx`, after a successful export call `void setSetting(db, 'last_export_ts', String(Date.now()))` (import `setSetting` from `../../db/queries`). On mount, read `last_export_ts`; if missing or older than 14 days, render `<p className="muted">⚠️ No backup in over 2 weeks — consider exporting.</p>`:
```tsx
import { useEffect, useState } from 'react'
import { setSetting, getSetting } from '../../db/queries'
// inside component:
const [stale, setStale] = useState(false)
useEffect(() => {
  void (async () => {
    const last = await getSetting(db, 'last_export_ts')
    setStale(!last || Date.now() - Number(last) > 14 * 86_400_000)
  })()
}, [db])
// in doExport(), after downloadBytes(...):
await setSetting(db, 'last_export_ts', String(Date.now()))
setStale(false)
// in JSX, above the export button:
{stale && <p className="muted">⚠️ No backup in over 2 weeks — consider exporting.</p>}
```

- [ ] **Step 5: Build to verify the PWA compiles**

Run: `npm run build`
Expected: build succeeds; `dist/` contains `sw.js`, `manifest.webmanifest`, and the icons. `npm test` still PASS.

- [ ] **Step 6: Write the manual smoke checklist**

`docs/MANUAL-SMOKE-CHECKLIST.md`:
```markdown
# Manual Smoke Checklist (PWA bits not covered by unit tests)

Run `npm run build && npm run preview`, open the preview URL on a real iPhone (Safari 17+).

- [ ] Add to Home Screen → app icon appears, launches fullscreen (no Safari chrome).
- [ ] Log a bottle feed; confirm it appears in Home timeline and today's totals update.
- [ ] Start a breastfeed timer; lock the phone for 1 minute; reopen → banner shows ~1m elapsed.
- [ ] Stop the timer → a breast entry with correct duration is saved.
- [ ] Add a weight measurement in kg; switch units to lb in Settings → Growth shows lb/oz.
- [ ] Turn on Airplane Mode; force-quit and relaunch → app loads and all data is present.
- [ ] Settings → Export → a `babytracker-YYYY-MM-DD.db` file downloads.
- [ ] Settings → Import that file on a fresh browser profile → data restored.
- [ ] Edit an entry's time in History; delete an entry (confirm dialog) → list updates.
```

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts public src/pwa.ts src/main.tsx src/components/settings/BackupSection.tsx docs/MANUAL-SMOKE-CHECKLIST.md
git commit -m "feat: add PWA manifest, service worker, offline support, and backup reminder"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** Feeding (breast/bottle/solids) → Task 10; sleep timer+manual → Tasks 8/10; diapers → Task 10; measures + temperature + charts → Task 11; meds, notes, → Task 10; photos schema exists (Task 5) — **note:** a photo *capture UI* is intentionally deferred (schema + `photo_id` column are in place; add a PhotoForm later if desired). Daily totals → Tasks 4/9; History edit/delete → Task 12; backup/export + units + profile → Task 13; PWA/offline/dark mode → Tasks 1/14.
- **Photos gap is deliberate:** the spec lists photos; this plan lays the data foundation but does not build the capture/compression UI to keep v1 focused. If photos are required for v1, add a Task 11b: `PhotoForm` using `<input type="file" capture>`, canvas resize to ≤1024px JPEG, `insertPhoto`, and a thumbnail in the timeline.
- **Type consistency:** `LogTarget` includes `'note'` via the `| 'note'` union in `App`/`LogSheet`; `MeasureForm` is referenced by `LogSheet` (Task 10) and defined in Task 11 — implement Task 11's `MeasureForm` before running Task 10's full suite, or use the documented stub.
- **No network:** all data flows through `useDb` → worker → OPFS; no fetch calls anywhere.
```

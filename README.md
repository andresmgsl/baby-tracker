# Baby Tracker

A local-first, offline-capable PWA for tracking a baby's feeds, sleep, diapers,
medications, notes, and growth measurements. All data lives on-device in a
SQLite database — nothing is sent to any server. It installs to the home screen
and works fully offline.

## Features

- **Quick logging** — one tap to record breast/bottle feeds, sleep, diapers,
  solids, meds, temperature, measurements, and free-text notes.
- **Live timers** — running timers for breastfeeding and sleep, resumed across
  reloads (persisted in the `active_timer` table).
- **Today view** — a running timeline plus daily totals (feeds, nappies, sleep).
- **History** — browse and edit past entries.
- **Growth** — weight/height/head-circumference measurements charted over time.
- **Settings** — baby profile, unit preferences (metric/imperial), and backup.
- **Backup & restore** — export the entire database to a `.db` file and import
  it back; a reminder nudges you when a backup is stale.
- **Installable & offline** — full PWA with a service worker caching the app
  shell (including the SQLite WASM binary).

## Tech stack

| Concern       | Choice |
|---------------|--------|
| UI            | React 18 + TypeScript |
| Build/dev     | Vite 6 |
| Data          | SQLite compiled to WebAssembly ([`@sqlite.org/sqlite-wasm`](https://github.com/sqlite/sqlite-wasm)) |
| Persistence   | OPFS (Origin-Private File System) — durable, per-origin browser storage |
| PWA           | `vite-plugin-pwa` (Workbox) |
| Tests         | Vitest + Testing Library (jsdom) |

## Architecture

The app is a single-page React app with a bottom tab bar (`Home`, `History`,
`Growth`, `Settings`). Global structure lives in `src/App.tsx`, which owns the
active tab, the log/edit bottom sheets, and a `refreshKey` used to re-render
lists after a write.

### Data layer

SQLite runs **inside a Web Worker** (`src/db/worker.ts`) using the OPFS VFS,
which requires a Worker context and cross-origin isolation (see below). The main
thread talks to it through a small message-passing client:

```
React components
  └─ useDb() ──▶ WorkerExecutor  (src/db/client.ts)
                   │  postMessage { exec | export | import }
                   ▼
                 Web Worker      (src/db/worker.ts)
                   └─ sqlite-wasm ──▶ OPFS file  baby-tracker.sqlite3
```

- `src/db/client.ts` — `makeWorkerExecutor()` wraps the worker in a promise-based
  `exec` / `transaction` / `exportBytes` / `importBytes` API, exposed to React
  via `<DbProvider>` and the `useDb()` hook.
- `src/db/worker.ts` — initializes sqlite-wasm, opens the OPFS-backed database,
  applies the schema, and handles `exec`/`export`/`import` messages.
- `src/db/schema.ts` — the full schema (`entries`, `measurements`, `photos`,
  `settings`, `active_timer`).
- `src/db/queries.ts` — typed query helpers (insert/list/update entries and
  measurements). `src/db/testExecutor.ts` provides an in-memory
  (`better-sqlite3`) executor so queries can be unit-tested without a browser.

### UI layout

```
src/
├── App.tsx                     app shell + tab routing + sheets
├── main.tsx                    React root, wraps <App> in <DbProvider>
├── pwa.ts                      service-worker registration (update prompt)
├── components/
│   ├── BottomTabs.tsx          bottom navigation
│   ├── home/                   Home tab: quick-log grid, timeline, totals,
│   │   ├── forms/              per-type log forms (Breast, Bottle, Sleep, …)
│   │   ├── LogSheet.tsx        bottom sheet that hosts the forms
│   │   └── TimerBanner.tsx     live running-timer banner
│   ├── history/                History list + edit sheet
│   ├── growth/                 measurements + hand-rolled SVG LineChart
│   └── settings/               profile, units, backup
├── db/                         SQLite worker, client, schema, queries
├── lib/                        pure helpers: time, timer, totals, units, backup
├── state/                      hooks: useEntries, useActiveTimer
└── styles/theme.css            design tokens + styling
```

Business logic is kept in pure, well-tested modules under `src/lib/` (e.g.
`totals.ts`, `units.ts`, `time.ts`, `timer.ts`) so it can be tested in isolation.

## Cross-origin isolation (important)

sqlite-wasm + OPFS require the page to be **cross-origin isolated**, which means
these two response headers must be present:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The Vite `dev` and `preview` servers set these automatically (see
`vite.config.ts`). **Any production host must send them too**, otherwise the
database will fail to initialize and the app won't load data.

## Getting started

Requires Node.js (developed on v26; any recent LTS should work).

```bash
npm install       # install dependencies
npm run dev        # start the dev server at http://localhost:5173
```

Open http://localhost:5173 in a browser. A modern browser with OPFS support
(Chrome/Edge/Brave, recent Safari/Firefox) is required.

### Scripts

| Command           | What it does |
|-------------------|--------------|
| `npm run dev`     | Vite dev server with COOP/COEP headers |
| `npm run build`   | Type-check (`tsc -b`) and build to `dist/` |
| `npm run preview` | Serve the production build locally (with COOP/COEP headers) |
| `npm run test`    | Run the Vitest suite once |

## Testing

Unit and component tests run under Vitest in a jsdom environment
(`src/test/setup.ts`). Database-backed tests use the in-memory `better-sqlite3`
executor (`src/db/testExecutor.ts`) instead of the WASM worker, so they run fast
and headless. There are ~17 test files covering queries, totals, units, timers,
forms, and screens.

```bash
npm run test
```

## Building & deploying

```bash
npm run build      # outputs a static site to dist/
```

Deploy `dist/` to any static host, but the host **must** send the two
cross-origin-isolation headers described above on the app's HTML (and ideally
all assets). Without them, sqlite-wasm/OPFS cannot start.

## Data & privacy

- All data is stored locally in the browser's OPFS — it never leaves the device.
- Because storage is per-origin and browser-managed, clearing site data (or some
  aggressive storage-eviction policies) will delete it. Use **Settings → Backup**
  to export a `.db` snapshot regularly; restore by importing that file.
- The exported file is a standard SQLite database and can be inspected with any
  SQLite tool.

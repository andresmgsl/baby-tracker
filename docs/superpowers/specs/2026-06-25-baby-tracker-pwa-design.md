# Baby Tracker — Design Spec

**Date:** 2026-06-25
**Status:** Approved design, ready for implementation planning

## Overview

A personal baby-tracking Progressive Web App (PWA) for one parent, modeled loosely
on apps like Onoco but stripped to only the features needed. The app is
installable to the phone home screen, runs fullscreen, works fully offline, and
stores all data locally on the device. Always dark mode.

It tracks day-to-day baby care (feeding, sleep, diapers, solids, meds) and growth
measurements (weight, height, head circumference, temperature), with photos and
free-text notes. It deliberately **excludes** features like a learning journey or
knowledge/content library.

### Goals

- Fast, one-handed logging — usable at 3am while holding a baby.
- Reliable local storage that never silently loses data.
- Clean, portable backup/export.
- Glanceable status ("when did she last…?") plus quick logging.

### Non-goals

- Multi-user / partner sync (single user, single device for v1).
- Cloud backend or accounts.
- Learning journey, knowledge book, or other content features.
- App-store / native distribution.

## Platform & Tech Stack

- **PWA** — installable (Add to Home Screen), fullscreen, offline-capable.
- **React + TypeScript + Vite** — application framework and build tooling.
- **SQLite (WASM)** via `@sqlite.org/sqlite-wasm`, persisted to **OPFS** (Origin
  Private File System). The real database is a single `.db` file on the device.
- **Web Worker** — SQLite + OPFS synchronous access must run off the main thread.
  A thin `db` module wraps the worker so the rest of the app calls a simple async
  API (`db.query(...)`, `db.exec(...)`).
- **vite-plugin-pwa** — generates the service worker + web app manifest for
  install/offline. WASM (~1 MB) is cached so the app loads offline.
- **Plain CSS** with a dark theme via CSS variables — no heavy UI framework.
- **Hand-built SVG line charts** for growth curves — avoids a large charting dep.
- Requires iOS 17+ (OPFS sync access handle in workers).

### Why local-first

No server, no accounts, no recurring cost; instant and private. The single
tradeoff — data lives in one browser — is mitigated by file-based backup/export
(see Behaviors).

## Screens & Navigation

A **bottom tab bar** with 4 tabs (thumb-reachable, one-handed). Always dark.

### Tab 1 — Home (log-first)

- Quick-log grid of buttons: **Breast, Bottle, Sleep, Diaper, Solids, More**.
  Each shows the last time it occurred (e.g. "2h 15m ago").
- **More** opens secondary actions: Measure, Temperature, Meds/Vitamins, Note, Photo.
- Today's **totals strip**: feeds / nappies / sleep duration.
- Today's **timeline** below (chronological, newest first).
- Tapping any log button opens a slide-up **log sheet**.
- If a timer is running, a banner shows "still timing… 1h 12m" with stop/discard.

### Tab 2 — History

- All entries, grouped by day, scrollable.
- Filter by type (e.g. just feeds, just diapers).
- Tap any entry to **edit or delete** it.

### Tab 3 — Growth

- Charts for weight, height, head circumference, temperature over time.
- Hand-built SVG line charts, latest value highlighted.
- "+" to add a new measurement.

### Tab 4 — Settings

- Baby profile: name, date of birth (drives age display, e.g. "4 mo").
- **Backup/Export** (download `.db`) and **Import** (restore from `.db`).
- Units: kg/lb, cm/in, °C/°F.
- Which quick-log buttons appear on Home (e.g. hide Solids until weaning).

## Logging Interaction (the log sheet)

When a log button is tapped, a sheet slides up. Pattern: **timer with manual
fallback** (applies to breast and sleep; other types are direct entry).

- **Breast:** side toggle (L / R / Both), a large **Start/Stop timer**, and the
  ability to tap duration/time to enter manually instead.
- **Sleep:** start a timer, or enter start/end by hand.
- **Bottle:** amount (ml) + milk type (breast/formula) + time.
- **Solids:** food (text) + time.
- **Diaper:** wet / dirty / both + time.
- **Meds/Vitamins:** name + dose + time.
- **Note:** free text + time.
- **Measure / Temperature:** value + time (stored to `measurements`).
- **Photo:** capture/select, resized & compressed, optionally attached to an entry.

## Data Model (SQLite)

### `entries` — all time-based timeline activities

| column | type | purpose |
|---|---|---|
| `id` | INTEGER PK | |
| `type` | TEXT | `breast` `bottle` `solids` `sleep` `diaper` `meds` `note` |
| `start_ts` | INTEGER | when it happened/started (epoch ms) |
| `end_ts` | INTEGER NULL | end for sleep & breastfeeds; duration is derived |
| `side` | TEXT NULL | breast: `L` / `R` / `both` |
| `amount_ml` | REAL NULL | bottle amount |
| `milk_type` | TEXT NULL | bottle: `breast` / `formula` |
| `food` | TEXT NULL | solids description |
| `diaper_kind` | TEXT NULL | `wet` / `dirty` / `both` |
| `med_name` | TEXT NULL | meds/vitamins name |
| `med_dose` | TEXT NULL | meds/vitamins dose |
| `note` | TEXT NULL | free text (Note type; any entry may carry one) |
| `photo_id` | INTEGER NULL | optional attached photo (FK → `photos.id`) |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |

### `measurements` — chartable points (Growth tab)

- `id` INTEGER PK
- `type` TEXT — `weight` / `height` / `head` / `temperature`
- `ts` INTEGER — when measured
- `value` REAL — **stored in canonical units** (grams, mm, °C); converted for
  display per Settings
- `note` TEXT NULL
- `created_at`, `updated_at` INTEGER

### `photos`

- `id` INTEGER PK, `blob` BLOB, `mime` TEXT, `created_at` INTEGER
- Images resized/compressed on capture so the `.db` stays reasonable.
- Tradeoff: photos live in the database, so the single-file backup is complete.
  If photo volume grows large, revisit storing them as separate OPFS files.

### `settings`

- `key` TEXT PK, `value` TEXT — units, visible quick-log buttons, last-export date, etc.

### `active_timer`

- `type` TEXT, `start_ts` INTEGER, `side` TEXT NULL — persists a running
  breast/sleep timer so it survives app close / phone lock. Elapsed time is
  computed live from `start_ts`; nothing runs in the background.

**Design notes:**
- Durations are **derived** (`end_ts − start_ts`), never stored — one source of truth.
- Each entry row is self-contained, making edit/delete straightforward.

## Key Behaviors

### Timer (breast & sleep)

- Start writes `active_timer` with `start_ts`. UI shows `now − start_ts`, updated each second.
- Correct after lock/close/reopen because elapsed is derived from the stored start
  time — no background process to drift or die (iOS PWAs disallow background timers).
- Stop creates the `entries` row (`start_ts` + `end_ts`) and clears `active_timer`.
- Manual fallback: edit start/end or type a duration without starting a timer.
- Reopening with a timer still running shows a clear banner to stop or discard.

### Backup & export

- Export writes the OPFS database to a downloadable `babytracker-YYYY-MM-DD.db`
  (real SQLite, openable anywhere).
- Import picks a `.db`, validates the schema, then **replaces** the current
  database after a confirm dialog (it overwrites).
- Gentle reminder to export if none has happened in ~2 weeks.

### Daily totals & age

- Totals (feeds, nappies, sleep duration) are SQL aggregates over the current day,
  computed on the fly — never stored stale.
- Age display derived from DOB.

### Error handling & resilience

- The DB worker is the single gatekeeper; if it can't init (e.g. OPFS
  unavailable), the app shows a clear message instead of silently dropping writes.
- Every write is a transaction; a failed save surfaces an error rather than a
  phantom entry.
- Deletes confirm; edits are immediate and re-editable.

### Offline / PWA

- Service worker caches app shell + WASM → instant offline launch.
- New deploy → "Update available — reload" prompt.

## Testing Strategy

- **Unit tests (Vitest)** for pure logic: duration derivation, daily-totals
  aggregation, age calculation, unit conversions (round-trip), timer elapsed
  edge cases (e.g. left running overnight). Built TDD-first.
- **DB module tests** against in-memory SQLite: insert/edit/delete; export→import
  round-trip yields an identical database. Built TDD-first.
- **Component tests** (React Testing Library) for the log sheet: timer start/stop
  creates the correct entry; manual entry validates inputs.
- **Manual smoke checklist** for PWA-specifics: install to home screen, offline
  launch, timer surviving phone lock on a real iPhone.

## Out of Scope (explicit)

- Partner/multi-user sync, cloud backend, accounts.
- Learning journey, knowledge book / content library.
- Pumping sessions.
- Native app / app-store distribution.

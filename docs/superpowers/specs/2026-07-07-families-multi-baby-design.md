# Families & Multiple Babies — Design

**Date:** 2026-07-07
**Status:** Approved (design), pending implementation plan

## Summary

Open the app from a single-baby, single-household tool to a **multi-family,
multi-baby** app. Two families (initially) each own one or more babies. A user
signs in, sees only their family's babies, and switches the **active baby** from
a sidebar drawer; the whole app (Home, History, Growth, timers, quick-log)
reflects that one baby at a time.

Isolation is **enforced on the server**: a family can never read or write
another family's data, even by crafting requests. This requires replacing the
current open raw-SQL endpoint with a named-query dispatch whose SQL and scope
live server-side.

## Goals

- Introduce a **baby** entity owned by a **family**.
- Let a user switch the active baby from a sidebar; everything reflects it.
- Manage babies in-app (add, rename, edit DOB, archive).
- Keep auth simple: two families defined in `.env`, no signup/admin UI.
- **Hard requirement:** server-enforced data isolation between families.
- Preserve all existing (real) data by migrating it to the owner's first baby.

## Non-goals (v1)

- Cross-family sharing of babies or data.
- A combined "both twins" merged timeline (possible fast-follow).
- In-app management of users/families (stays in `.env`).
- Per-user preferences (units are per-family).
- Baby avatars/photos beyond existing photo support.

## Decisions (from brainstorming)

1. **Isolation:** enforced server-side (not client-scoped, not per-family DB file).
2. **User/family management:** env config, extended — accounts tagged with a
   family in `BT_USERS`; babies managed in-app.
3. **Baby view:** one active baby at a time, switched via sidebar.
4. **Enforcement mechanism:** Approach A — named-query RPC; the server owns the
   SQL for the ~19 queries and injects family/baby scope.

---

## 1. Data model

A **baby** belongs to a **family**. `family` is an env-defined key string
(e.g. `lopez`). Activity data scopes to a **baby**; preferences scope to a
**family**. There is intentionally **no `families` table** — family identity
comes from the env tag, and the babies row carries the `family` key. (A family
display-name can be added later; YAGNI now.)

### New table

```sql
CREATE TABLE IF NOT EXISTS babies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family TEXT NOT NULL,
  name TEXT NOT NULL,
  dob INTEGER,
  archived_at INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_babies_family ON babies(family);
```

### Changed tables

- **entries** — add `baby_id INTEGER NOT NULL REFERENCES babies(id)`.
  Replace `idx_entries_start` with `idx_entries_baby_start ON entries(baby_id, start_ts)`.
- **measurements** — add `baby_id INTEGER NOT NULL REFERENCES babies(id)`.
  Replace `idx_measurements_type_ts` with
  `idx_measurements_baby_type_ts ON measurements(baby_id, type, ts)`.
- **photos** — add `baby_id INTEGER NOT NULL REFERENCES babies(id)`.
- **active_timer** — PK changes from `(type)` to `(baby_id, type)` so each baby
  has independent running timers.
- **settings** — PK changes from `(key)` to `(family, key)`. Units (ml/oz) live
  here, per family. The old `baby_name` / `baby_dob` settings are **removed** —
  they become `babies.name` / `babies.dob`.

## 2. Auth & session

- Extend `BT_USERS` to tag each account with a family:
  ```
  andres:family=lopez:scrypt$…,maria:family=lopez:scrypt$…,otherparent:family=nunez:scrypt$…
  ```
  `parseUsers` returns `name → { family, hash }`. Parsing stays unambiguous:
  split the first `:` for the name, then if the remainder starts with `family=`,
  take up to the next `:` as the family key (keys are `:`-free, controlled by
  us) and the rest as the `scrypt$…` hash. Base64 padding (`=`) only appears
  trailing inside the hash, so it never interferes. A missing `family=` segment
  is a config error (reject or fall back to a default family — chosen in plan).
- The **session cookie keeps storing only the username**. On each request the
  server resolves `username → { family }` from env, producing a request context
  `{ user, family }`. Re-tagging a user's family in `.env` takes effect on the
  next request without re-issuing cookies.
- `hash-password` script output and `BT_USERS` docs updated for the new format.

## 3. Enforcement / API layer (Approach A)

### Endpoints

- Remove the open `/api/exec` and `/api/tx`.
- Add `POST /api/q` — body `{ name, args }`, runs one named query.
- Add `POST /api/qtx` — body `{ ops: [{ name, args }, …] }`, runs the ops in a
  transaction.
- `/api/export` and `/api/import` stay but must be scoped/gated (see Risks).

### Query registry (server-side)

- A registry maps query `name` → handler `(db, ctx, args) => rows`, where
  `ctx = { family, babyId }`.
- The ~19 functions currently in `src/db/queries.ts` move their **SQL** into this
  registry. Handlers inject scope:
  - **Baby-scoped** queries (entries, measurements, photos, timers, live-sync
    marker) always include `baby_id = ctx.babyId` in their SQL; the client never
    supplies a raw `baby_id`.
  - **Family-scoped** queries (list/add/rename/archive babies; get/set settings)
    include `family = ctx.family`.

### Active baby & validation

- The active baby travels in an **`X-Baby-Id` request header**, attached
  automatically by the client from the active-baby context.
- Before running any baby-scoped query, the server validates the header:
  `SELECT 1 FROM babies WHERE id = ? AND family = ?`. On mismatch → **403** (a
  family cannot touch a baby that isn't theirs, nor a nonexistent one). The
  validated `babyId` is placed in `ctx`. **Archived babies still pass
  validation** — archiving is a switcher-visibility filter, not an access
  revocation, so a family can still view/un-archive an archived baby's data.
- Family-scoped queries ignore `X-Baby-Id` and use `ctx.family` only.

### Client changes

- `src/db/queries.ts` keeps its function names/signatures but its bodies become
  thin typed calls to `/api/q` / `/api/qtx` (raw `SqlExecutor` usage removed).
- A new **active-baby context** provides the current `baby_id`; the client
  transport attaches `X-Baby-Id` on every request.
- Components and hooks keep calling the same query functions — the change is
  mechanical (drop the `exec`/`useDb()` argument), not a rewrite.

## 4. Migration

Runs once on server startup, guarded so it is idempotent:

1. Create the `babies` table; add `baby_id` columns; rebuild indexes; migrate
   `active_timer` and `settings` primary keys.
2. Determine the legacy family from a `LEGACY_FAMILY` env var, defaulting to the
   **first family** appearing in `BT_USERS`.
3. Create one baby under that family, seeded from the existing `baby_name` /
   `baby_dob` settings (fallback name if unset).
4. Assign **all** existing `entries`, `measurements`, `photos`, and
   `active_timer` rows to that new `baby_id`.
5. Move the units setting into `(legacy_family, 'units')`; drop the legacy
   `baby_name` / `baby_dob` settings rows.
6. The second family starts with **zero babies** and is prompted to add their
   first baby on first login.

SQLite note: adding a `NOT NULL` column with existing rows requires a default or
a rebuild. Plan: add the column nullable, backfill `baby_id`, then enforce
non-null via the app layer (SQLite can't easily add `NOT NULL` after the fact
without a table rebuild; a table-rebuild migration is acceptable if cleaner).
The implementation plan will pick the concrete mechanism.

## 5. UI — baby switcher

- A **slide-in sidebar drawer**, opened from a header element that shows the
  active baby's name and a chevron. Lists the family's non-archived babies,
  highlighting the active one; tap a baby to switch.
- Switching updates the **active-baby context** (persisted in `localStorage`
  per device) and triggers a data reload. All screens read from the context.
- **Manage babies** — a section (in the drawer and/or Settings) to add a baby
  (name + DOB), rename, edit DOB, and archive. Archived babies leave the default
  switcher but retain their data; a "show archived" affordance lets you reach
  them (to view history or un-archive).
- **Empty family** — if the signed-in family has zero babies (new family's first
  login, or after archiving all), route to an "Add your first baby" screen
  before Home.
- `useLiveSync` changes from a global change-marker to a **per-active-baby**
  marker, so switching babies re-syncs correctly and doesn't cross-trigger.
- The existing `ProfileSection` (Settings → Baby) is replaced/absorbed by the
  manage-babies flow, since name/DOB now live on the baby row.

## 6. Testing

**Server**
- Family isolation: Family B requesting Family A's `baby_id` → 403 (read and
  write paths, single query and transaction).
- Query-registry scope injection: baby-scoped handlers always filter by
  `ctx.babyId`; family-scoped by `ctx.family`.
- `parseUsers` with `family=` tags (and rejection of malformed entries).
- Session → `{ user, family }` resolution.
- Migration: legacy rows land on the seeded baby; idempotent on re-run;
  second family empty.

**Client**
- Active-baby context: selection, persistence, `X-Baby-Id` attachment.
- Baby switcher drawer and manage-babies (add/rename/DOB/archive).
- Empty-family "add first baby" gate.
- Update existing tests (Home, History, Growth, timers) to run under a baby
  context.

## Risks & open items

- **Backup/restore scope.** `/api/export` currently ships the whole SQLite file
  — that would leak both families' data to whoever exports. v1 options: (a)
  restrict export/import to a designated admin family, or (b) export only the
  requesting family's rows. Decide during planning; default to **(a) admin-only,
  whole-file** to stay simple, documented clearly.
- **NOT NULL backfill** mechanism for `baby_id` (nullable-then-backfill vs table
  rebuild) — chosen in the plan.
- **Live-sync marker** must be per-baby; verify the polling hook and any totals
  caches key off the active baby.
- Ensure `active_timer` PK migration preserves the currently-running timer for
  the legacy baby.
- **Running timers are per-baby.** A timer started on baby A disappears from the
  `TimerBanner` when you switch to baby B, risking a forgotten running timer
  (real for twins). v1 keeps timers per-baby (the banner shows only the active
  baby's); a cross-baby "another baby has a running timer" indicator is a
  possible fast-follow, noted here so it isn't lost.

## Success criteria

- Two families configured in `.env`; each signs in and sees only their babies.
- A family with multiple babies switches between them from the sidebar; all
  screens reflect the active baby.
- Server rejects any attempt by one family to access another family's baby (403).
- Existing data is intact under the legacy family's first baby after migration.
- New family can add their first baby and log activity independently.

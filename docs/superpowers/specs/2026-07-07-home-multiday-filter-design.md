# Home multi-day preview + filter chips

**Date:** 2026-07-07
**Status:** Approved

## Problem

The Home tab shows only *today* — today's totals and today's timeline. Users want to
glance at the last few days without leaving Home, and to narrow the timeline to a
specific activity type (e.g. only diapers, or only sleep). The reference app (ONOCO)
does this with a scrolling multi-day "Full Timeline" and a "Filter by" grid of type
icons.

The existing **History** tab already shows all days grouped by date with a simple
`<select>` type filter. This feature brings a lightweight version of that onto Home;
History stays as the full archive.

## Goals

- Home timeline shows **today + the previous 2 days** (a 3-day preview).
- A **filter chip row** lets the user narrow the timeline to one or more activity types.
- A **"See all →"** link jumps to the full History tab.
- The **Today totals strip is unchanged** — always a full, unfiltered daily summary.

## Non-goals (YAGNI)

- Infinite scroll or a "load more" button.
- Filtering the totals strip.
- Changing the History tab.
- Persisting the filter selection across sessions.

## Design

### Data range

`Home` currently calls `useEntries(startOfDay(now), endOfDay(now))`. Widen it to the
last 3 calendar days:

- from: `startOfDay(now − 2 * DAY)`
- to:   `endOfDay(now)`

`listEntriesBetween` filters by `start_ts`, so entries are assigned to the day they
started (a sleep that started late last night and ended this morning appears under the
day it started — acceptable for a preview).

### Today-only totals

Widening the range would otherwise inflate the Today totals. Compute totals from the
today subset only:

```ts
const todayStart = startOfDay(now)
const todayEntries = entries.filter((e) => e.start_ts >= todayStart)
const totals = useMemo(() => computeDailyTotals(todayEntries), [todayEntries])
```

### Day grouping — `dayGroups.ts`

New pure helper in `src/components/home/`:

```ts
export interface DayGroup { key: string; label: string; entries: Entry[] }
export function dayGroups(entries: Entry[], now: number): DayGroup[]
```

- Groups entries by calendar day of `start_ts`.
- Sorted newest day first; entries within a day already come newest-first from the query.
- `label`: `"Today"` for today, `"Yesterday"` for the prior day, otherwise
  `"Sat, 5 Jul"` (`weekday: 'short', day: 'numeric', month: 'short'`).
- `key`: `startOfDay(ts)` as a string, for React keys.

Unit-tested: grouping boundaries, ordering, and the Today/Yesterday/date labels.

### Filter chips — `TimelineFilter.tsx`

A horizontal row of tappable type icons above the timeline:

| type | icon |
|------|------|
| breast | 🤱 |
| bottle | 🍼 |
| solids | 🥄 |
| sleep | 😴 |
| diaper | 💧 |
| meds | 💊 |
| note | 📝 |

- **Multi-select toggle.** State is a `Set<EntryType>` of selected types.
- **Empty selection = show everything** (the default).
- Tapping a chip toggles it in/out of the set.
- Selected chips are visually highlighted (`aria-pressed`).

Pure helper (co-located, unit-tested):

```ts
export function filterEntries(entries: Entry[], selected: Set<EntryType>): Entry[]
```

Returns `entries` unchanged when `selected` is empty, otherwise only entries whose
`type` is in the set.

**Scope:** the filter applies to the timeline entries *before* grouping. It does not
touch the totals strip.

### Home render order

```
InstallBanner
TimerBanner (if active)
QuickLogGrid
more-row (Measure / Temp / Note)
"Today" label
TotalsStrip            ← today-only, unfiltered
"Timeline" label
TimelineFilter         ← chip row
  for each DayGroup (filtered):
    day label
    Timeline entries={group.entries}
"See all →"            ← onSeeAll()
```

`Timeline` stays as-is (a flat list for one group). Home maps day groups to
`day header + <Timeline>`. Empty state (no entries in the window, or filter matches
nothing) is handled in Home with a muted message; Home does not render empty groups.

### "See all" navigation

- `Home` gains an `onSeeAll: () => void` prop.
- `App` passes `onSeeAll={() => setTab('history')}`.

### Styles

Add chip styles to `theme.css`: a flex-wrap row of pill/icon buttons, with a
selected/pressed state. Reuse existing timeline/`sectlbl` styles.

## Files touched

| File | Change |
|------|--------|
| `src/components/home/dayGroups.ts` | new — grouping + labels |
| `src/components/home/dayGroups.test.ts` | new — unit tests |
| `src/components/home/TimelineFilter.tsx` | new — chip row + `filterEntries` |
| `src/components/home/TimelineFilter.test.tsx` | new — chip toggle + filter tests |
| `src/components/home/Home.tsx` | widen range, today-only totals, grouped days, filter state, See-all |
| `src/App.tsx` | pass `onSeeAll` |
| `src/styles/theme.css` | chip styles |
| `src/components/home/Home.test.tsx` | update for multi-day + filter |

## Testing

- `dayGroups`: correct grouping across day boundaries, newest-first order,
  Today/Yesterday/date labels.
- `filterEntries`: empty set → passthrough; non-empty → only matching types.
- `TimelineFilter`: tapping a chip toggles selection and `aria-pressed`.
- `Home`: renders multiple day groups; totals reflect today only even with older
  entries present; selecting a chip narrows visible rows; "See all" fires `onSeeAll`.

# Editable Meds & Cross-Midnight Sleep Totals — Design

Date: 2026-07-10

Two independent fixes to user-reported feedback:

1. **Editable meds** — after logging a med you can't change the name or dose (drops); the edit sheet only exposes start/end/note.
2. **Cross-midnight sleep** — a sleep that starts at 10pm and ends at 3am is counted entirely on the start day; the 3 hours after midnight never reach the new day's sleep total.

Both are contained changes. Totals are rendered in exactly one place (today's strip on the Home screen), and the edit sheet is the only place entries are edited.

---

## Item 1 — Editable meds (name + dose)

### Problem
`src/components/history/EditEntrySheet.tsx` renders only Start, End (when present), and Note. A `meds` entry has no `end_ts`, so it shows just Start + Note — `med_name` and `med_dose` can never be changed after creation.

### Change
In `EditBody`, when `entry.type === 'meds'`:

- Add local state seeded from the entry: `medName = entry.med_name ?? ''`, `medDose = entry.med_dose ?? ''`.
- Render two labelled text inputs ("Name", "Dose") above the Note field, matching the styling used in `MedsForm.tsx` (`className="text-input"`).
- In `save()`, when `entry.type === 'meds'`, add to the patch: `med_name: medName.trim() || null`, `med_dose: medDose.trim() || null`.

No other entry type is affected. The existing start/end/duration/note logic is untouched. Meds have no `end_ts`, so the End block does not render for them (already the case).

### Scope decision
Meds only. Bottle amount, diaper kind, solids food, etc. remain non-editable in the sheet (explicitly out of scope for this change).

---

## Item 2 — Clip sleep to each day

### Problem
- `src/lib/totals.ts` sums the whole session onto its start day: `sleepMs += e.end_ts - e.start_ts`.
- `src/components/home/Home.tsx` builds `todayEntries` by filtering `start_ts >= todayStart`, then calls `computeDailyTotals(todayEntries)`.

Result: a 10pm→3am session is attributed 100% to yesterday. Today's strip shows none of the post-midnight portion.

### Change

**`src/lib/totals.ts` — `computeDailyTotals` gains an explicit day window:**

```
computeDailyTotals(entries: Entry[], dayStart: number, dayEnd: number): DailyTotals
```

- **feeds / diapers** — unchanged semantics: count entries whose `start_ts` is within `[dayStart, dayEnd]` and whose type matches. Point events belong to their start day. (This filtering now happens inside the function instead of the caller.)
- **sleep** — for each sleep entry with `end_ts != null`, add the overlap with the day window:

  ```
  overlap = max(0, min(end_ts, dayEnd) - max(start_ts, dayStart))
  ```

  - 10pm→3am contributes 2h to yesterday's window and 3h to today's window.
  - A session fully within the day contributes its full duration.
  - A session entirely on another day contributes 0.
  - Ongoing sleeps (`end_ts == null`) contribute 0 (unchanged).

**`src/components/home/Home.tsx`:**

- Remove the `todayEntries` memo — it is consumed only by the totals call (`Home.tsx:37-38`), nothing else references it.
- Call `computeDailyTotals(entries, todayStart, endOfDay(now))`, passing the full loaded `entries` array so a session that started yesterday but overlaps today is included.
- The loaded window already spans `startOfDay(now - 2 * DAY)` → `endOfDay(now)`, so yesterday's late-night session is present.

`DailyTotals` shape (`src/db/types.ts`) is unchanged. `TotalsStrip.tsx` is unchanged.

### Scope decision
Clip-to-day (physically accurate, sums to the true total across days), not full-session-on-both-days. Only today's strip consumes totals, so no other view changes.

---

## Testing

**`src/lib/totals.test.ts`** — add cases for the new signature:
- Sleep crossing midnight: assert yesterday's window gets the pre-midnight portion and today's window gets the post-midnight portion.
- Sleep fully within the day: full duration counted.
- Sleep entirely outside the window: 0 counted.
- Ongoing sleep (`end_ts == null`): 0 counted.
- feeds/diapers counted only when `start_ts` is within the window.

**`src/components/history/EditEntrySheet` test** — a meds entry: change the dose, save, assert `updateEntry` is called with the updated `med_dose` (and `med_name`).

---

## Files touched

- `src/lib/totals.ts` — new signature + overlap logic.
- `src/lib/totals.test.ts` — new/updated tests.
- `src/components/home/Home.tsx` — pass day window; drop totals pre-filter.
- `src/components/history/EditEntrySheet.tsx` — editable meds name/dose.
- `src/components/history/EditEntrySheet` test — meds edit coverage.

## Out of scope
- Ongoing (unfinished) sleeps counting toward totals.
- Editing type-specific fields other than meds.
- Per-day totals for non-today days (not rendered anywhere).

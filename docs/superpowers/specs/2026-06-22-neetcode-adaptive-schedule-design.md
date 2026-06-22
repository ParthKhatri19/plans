# NeetCode Plan — Adaptive Schedule Design

**Date:** 2026-06-22
**File affected:** `neetcode150-plan.html` only
**Status:** Approved design, ready for implementation plan

## Problem

The NeetCode 150 plan (`neetcode150-plan.html`) is a **fixed calendar baked into
the data**. Each entry in `DATA.days` has a hardcoded `date` and a fixed list of
tasks. The saved state (`localStorage["nc150:v1"]`, schema `{done, flag}`) only
records *which task IDs are done/flagged* — it has no notion of *when* a task was
done, and nothing recomputes the dates.

Consequences today:

- **Solve extra problems in a day** → just extra checkmarks. Future dates and the
  finish date don't move. You're silently "ahead" with no indicator.
- **Skip a day / skip weekend problems** → those problems stay unchecked on their
  past dates, "today" marches on, and you're silently behind with no overdue cue.

The user wants the calendar to *react* to real pace while keeping a stable target
finish date.

## Goals

1. Hold the **finish date** (2026-10-10) as the anchor.
2. When **behind**, redistribute remaining problems across remaining days so the
   finish date is still met (upcoming days get heavier).
3. When **ahead**, keep the original per-day load (days do **not** thin out); the
   user simply finishes early in practice. Show an ahead/behind pace indicator.
4. Preserve **topic order**, the **weekday/weekend rhythm**, and **phase/week**
   groupings while the calendar flexes.
5. Reviews/mocks **ride along** with problem progress (they flow to wherever their
   neighboring problems land in the ordered stream), rather than staying pinned to
   original calendar dates.

## Non-Goals

- No completion timestamps / history / analytics (rejected Approach B).
- No change to the storage schema, the dashboard (`index.html`), or other plans.
- No reordering of topics; topic sequence is fixed.

## Baseline facts (parsed from current `DATA`)

- 150 problems, 27 reviews, 6 mocks. No behavioral/system-design tasks exist in
  the data despite the patterns mentioned in `CLAUDE.md`.
- 111 days, 16 weeks, 2026-06-22 → 2026-10-10.
- Per-day problem load: weekdays ≈ 1, weekends a "push" of up to 4
  (weekday avg 0.88, weekend avg 2.58). 14 rest/review-only days.
- The task stream is already fully ordered across days; reviews sit interleaved
  (e.g. `… p010, p011, r001 …`). This is why "ride along" needs no cadence math —
  preserving stream order is sufficient.

## Core model (Approach A — dynamic recompute on load)

The plan stops being a fixed calendar and becomes a **dynamic projection**
recomputed on every page load from exactly two inputs:

1. The **canonical ordered task stream** (baked in `DATA`, never mutated).
2. The saved **`done` set** plus **today's date**.

No new persisted state. `{done, flag}` schema is untouched, so there is no
migration. The projection is idempotent and self-correcting: the displayed
schedule is always "true" relative to current progress and today's date.

Trade-off accepted: a problem's *displayed date* can shift between sessions. That
is the intended behavior, but it means "what's scheduled on a specific future
date" is not stable across sessions.

## The scheduling engine

On load:

1. Build the ordered stream `S` of all tasks from `DATA` (already in order). Each
   item retains `id`, `kind` (`problem` | `review` | `mock`), `cat`, `diff`,
   `phase`, and its original week grouping.
2. `remaining` = items of `S` where `!done[id]`, in order.
3. Walk remaining calendar days from **today → fixed finish date (2026-10-10)**.
   Each day has a **problem capacity**:
   - `capacity = max(baselineForDow, catchUpRate)`
   - `baselineForDow` = 1 on weekdays, the weekend push (up to 4) on weekends —
     the original rhythm.
   - `catchUpRate` = remaining problems spread across remaining problem-slots,
     scaled across the weekday/weekend ratio so that when behind, weekday and
     weekend loads rise **together**, preserving the rhythm's shape.
4. Fill each day with problems up to `capacity`, taking from `remaining` in order.
5. **Reviews/mocks ride along**: when the next `remaining` item is a review/mock,
   attach it to the current day without consuming problem capacity.
6. Past unsolved problems automatically flow forward into today and later — so
   "behind" manifests as **heavier upcoming days**, not a separate overdue pile.

### Ahead / behind made symmetric by `max()`

- **Ahead**: `catchUpRate < baseline` → `max()` keeps days at baseline; the
  `remaining` list is exhausted before the finish date. Days do **not** get
  lighter.
- **Behind**: `catchUpRate > baseline` → days get heavier; finish date held.

## Pace badge

Surfaced in the hero/stats area:

- `expected` = number of problems the **baseline** (original) schedule had
  scheduled on/before today.
- `actual` = solved problem count.
- `delta = actual − expected`.
- Render: **"Ahead by N"** / **"Behind by N"** / **"On track"**, optionally
  expressed in days. Color: mint (ahead), neutral (on track), coral (behind),
  matching the existing palette.

## Fallbacks / edge cases

- **Impossible to finish on time**: cap per-day problem load at a sane maximum
  (e.g. 2× the weekend push ≈ 8). If even the capped load overflows the finish
  date, the **finish date slips as a last resort**, with a clear warning badge:
  "at max pace, finish moves to `<date>`; you'd need N/day to hold Oct 10".
- **Finished early**: remaining days render empty/celebratory; badge
  "Done early by N days".
- **Weeks/phases**: kept as derived groupings — the week label and its membership
  are preserved; only the displayed **date range** flexes to wherever that week's
  tasks now fall.
- **Today not in plan window** (before start or after finish): fall back to first
  day on/after today, else the last day, mirroring the existing `focusIndex()`.

## Code impact

`neetcode150-plan.html` only:

- Introduce `computeSchedule()` that produces the projected `days` array
  (each with a computed `date`, `dow`, `tasks`) from the canonical stream +
  `done` + `todayISO`.
- `DATA` is reinterpreted as the canonical **ordered stream** + `meta` (with the
  fixed finish date). The existing per-day `date` values become the *baseline*
  reference used only to compute `expected` for the pace badge.
- Render layer (focus/today card, week sections, day cards, stats, climb SVG)
  reads the computed days instead of static `days[].date`.
- No change to storage, filtering, search, or flagging logic.

## Rejected alternatives

- **Approach B (persisted reschedule + completion timestamps):** enables history
  and accurate streaks, but requires a schema migration and far more state to keep
  consistent. Overkill for the stated need.
- **Approach C (indicator only, no reschedule):** simplest, but does not deliver
  the "redistribute to keep the finish date" behavior the user asked for.

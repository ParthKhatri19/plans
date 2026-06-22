# Completed-on-day timeline + estimated finish date

**Date:** 2026-06-22
**Scope:** `neetcode150-plan.html`, `schedule.js`, `tests/schedule.test.js`
**Out of scope:** `index.html` dashboard, `health-plan.html`

## Problem

Two issues on the NeetCode plan page:

1. **Completed problems disappear.** The adaptive engine builds the visible schedule
   from `remaining = stream.filter(it => !done[it.id])` (`schedule.js:82`). The instant a
   problem is checked done it is dropped from `days`, so it is no longer rendered anywhere.
   The "Completed" filter chip (`neetcode150-plan.html:450`) consequently shows nothing.
   The app also stores no completion timestamp — `STATE.done[id]` is just `true`
   (`neetcode150-plan.html:222`) — so it cannot know *when* a problem was finished.

2. **No prominent estimated finish date.** The engine computes `projectedFinish`, but it
   only surfaces inline in the focus panel, and only when the plan slips or finishes early
   (`neetcode150-plan.html:415-417`).

## Goals

- A finished problem stays visible, shown under **the calendar day it was actually checked
  off**, marked done, in one continuous history → today → future timeline grouped by the
  existing Week accordion.
- An always-visible **"Est. finish · &lt;date&gt;"** derived from the existing
  `projectedFinish` (no new pace math).

## Design

### 1. Record completion date (`neetcode150-plan.html`)

Add a parallel `at` map to state; keep `done` a plain boolean so the dashboard's
`Object.values(state.done).filter(Boolean).length` count is unaffected.

- State shape: `STATE = { done:{}, flag:{}, at:{} }`.
- `setDone(id, val)`:
  - check → `STATE.done[id] = true; STATE.at[id] = todayISO;`
  - uncheck → `delete STATE.done[id]; delete STATE.at[id];`
- Load (both `window.storage` and `localStorage` branches): merge `p.at || {}`.
- Reset: `STATE = {done:{}, flag:{}, at:{}}`.

**Backward compatibility:** a problem already completed before this change has
`done[id]===true` but no `at[id]`. Such tasks fall back to their baseline (originally
planned) date for timeline placement.

### 2. Unified timeline (`schedule.js`)

`computeSchedule` stays as-is (it produces the adaptive **future** days from remaining
tasks). Add history and a merge step.

New function `computeTimeline(opts)` where `opts` is the existing `computeSchedule` opts
plus `at` (the `STATE.at` map):

1. Compute `future = computeSchedule(opts)` (remaining work, today onward — unchanged).
2. Build **history days** from completed tasks (`done[it.id]` true):
   - Completion date of a task = `at[id]` if present, else its `baselineDate`.
   - Group completed tasks by completion date.
   - Within a day, keep tasks in stream order.
   - Build each history day with the existing `makeDay(date, tasks, slogan)` so it carries
     `week`, `dow`, `full`, `est`, etc. The day's `week` is `tasks[0].week` (stream-order
     first task), matching `makeDay`'s existing behavior.
   - Slogan for a history day: reuse the baseline slogan for that date if one exists, else "".
3. **Merge today:** if a history day and a future day share the same `date` (the only
   overlap is today — future starts at `todayISO`), merge them into one day object: future
   (remaining) tasks plus that day's completed tasks, tasks ordered completed-first then
   remaining (so the card reads "done today" above "left today"). Recompute `est`.
4. Return `{ days, history, future: future.days, slipped, projectedFinish, finishedEarly }`
   where `days` is the full chronological list: history days (date &lt; today) + merged
   today + future days (date &gt; today), each still tagged with `week`.

Days are **sorted by date within each week bucket** by the renderer (see §3), so a
late-completed early-week problem appears in its original Week-N accordion, dated when it
was actually finished.

`computeSchedule`, `computePace`, and all existing exports are unchanged; `computeTimeline`
is added to the export object.

### 3. Rendering (`neetcode150-plan.html`)

- Replace the two `computeSchedule(...)` call sites (`:248`, `:266`) with
  `computeTimeline(...)`, passing `at: STATE.at`. `SCHED.days` becomes the unified list;
  `SCHED.projectedFinish` / `slipped` / `finishedEarly` keep their current meaning.
- In `renderPlan` / week grouping, **sort each week's days by `date` ascending** before
  rendering so history and future interleave chronologically within the bucket.
- `taskHTML` already renders `.done` styling from `STATE.done` — no change needed for the
  checkbox state.
- A fully-completed day (existing `dayComplete(d)` helper) gets a subtle "✓ done" marker in
  its day header (`dayHTML`).
- `focusIndex()` is unchanged (first computed day on/after today, else last) — today's
  merged card or the next future day remains the focus.
- **Side effect (intended):** the "Completed" filter chip now has done tasks present in
  `days` and starts filtering correctly with no extra work.

### 4. Estimated finish stat (`neetcode150-plan.html`)

In `renderStats`, add an always-visible estimate sourced from `SCHED.projectedFinish`,
formatted with `Schedule.fmtFull`. Surface it as the sub-line of the existing pace stat (or
an adjacent tile): **"Est. finish · &lt;Mon D, YYYY&gt;"**. The existing inline
slip/finished-early note in the focus panel stays as-is.

## Edge cases

- **Uncheck:** removing `done[id]`/`at[id]` drops the task from history and returns it to
  the adaptive future on the next `recompute()`.
- **Completed early** (before baseline date): shows on its actual earlier completion date —
  the core ask.
- **Completed with no `at`** (pre-existing): falls back to baseline date.
- **Day mixing weeks:** a calendar day on which problems from two baseline weeks were
  completed attaches to `tasks[0].week` (stream-order first). Acceptable for a personal
  dashboard; not specially handled.
- **All done:** history fully populated, `future.days` empty, focus panel shows the existing
  "all complete" message.

## Testing (`tests/schedule.test.js`)

Add cases for `computeTimeline`:

- History day placed on `at[id]` date when present.
- History day falls back to `baselineDate` when `at[id]` missing.
- Today merge: a task completed today plus remaining-today work land in a single day object
  for `todayISO`, completed-first.
- Unchecking (task absent from `done`) removes it from history and it reappears in `future`.
- `projectedFinish` / `slipped` / `finishedEarly` are exposed by `computeTimeline` and match
  the underlying `computeSchedule` result.
- Existing `computeSchedule` / `computePace` tests continue to pass unchanged.

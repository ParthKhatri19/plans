# NeetCode Adaptive Schedule — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `neetcode150-plan.html` recompute its calendar on every load from actual progress, holding the finish date firm (Oct 10, 2026): falling behind packs upcoming days heavier, getting ahead leaves days at baseline and finishes early, with a pace badge showing ahead/behind.

**Architecture:** A new pure, dependency-free module `schedule.js` holds the scheduling engine (UMD: usable both via `<script>` in the browser and `require()` in Node tests). `neetcode150-plan.html` loads it, flattens the existing `DATA.days` into a canonical ordered task stream, and renders the *computed* days the engine returns. The saved state schema (`localStorage["nc150:v1"]` = `{done, flag}`) is untouched, so there is no migration. The engine is recomputed from `(stream, done set, today)` on every load and is idempotent.

**Tech Stack:** Vanilla ES5-compatible JavaScript (no build step, must run from `file://`), Node's built-in `node:test` runner for the engine's unit tests. No new runtime dependencies.

## Global Constraints

- No build step. Files must work opened directly via `file://`. `schedule.js` is loaded with a plain `<script src="schedule.js"></script>` tag (NOT `type="module"` — ES module imports fail under `file://`).
- `schedule.js` must use the UMD pattern so the same file exports for Node tests and attaches `window.Schedule` in the browser.
- Do NOT change the storage schema. `localStorage` key stays `"nc150:v1"`, value stays `{"done":{},"flag":{}}`.
- Do NOT modify `index.html` (the dashboard), `health-plan.html`, or any other plan.
- The fixed finish date is `DATA.meta.end` (`"2026-10-10"`). Do not hardcode it elsewhere; read it from `meta`.
- ISO date strings (`"YYYY-MM-DD"`) compare correctly with `<`/`<=`/`>`; rely on lexicographic comparison rather than constructing `Date` objects for ordering.
- Baseline rhythm: 1 problem per weekday, weekend "push" of 4. Max per-day cap before the finish date is allowed to slip: 8.
- Tests run with: `node --test tests/schedule.test.js` from the repo root (`D:/Plans`).

---

## File Structure

- **Create `schedule.js`** — pure scheduling engine. Responsibilities: flatten `DATA.days` to an ordered stream, compute the adaptive day-by-day schedule, compute the ahead/behind pace. No DOM, no `localStorage`, no globals beyond the UMD export.
- **Create `tests/schedule.test.js`** — `node:test` unit tests for every engine function.
- **Modify `neetcode150-plan.html`** — load `schedule.js`; replace the static `days` source with the computed schedule; add the pace badge and finish-status UI; repoint `streak()`/pace at the baseline copy of `DATA.days`.

---

## Task 1: Engine scaffold — UMD export, date helpers, EST map

**Files:**
- Create: `schedule.js`
- Test: `tests/schedule.test.js`

**Interfaces:**
- Produces:
  - `Schedule.EST` — object mapping difficulty/kind to minutes.
  - `Schedule.addDaysISO(iso, n) -> isoString`
  - `Schedule.enumerateDays(startISO, endISO) -> [isoString]` (inclusive; `[]` if start > end)
  - `Schedule.isoDow(iso) -> "Sun".."Sat"`
  - `Schedule.isWeekend(iso) -> boolean` (Sat or Sun)
  - `Schedule.fmtFull(iso) -> "Jun 28, 2026"`

- [ ] **Step 1: Write the failing test**

Create `tests/schedule.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const S = require("../schedule.js");

test("addDaysISO advances and rolls over months", () => {
  assert.strictEqual(S.addDaysISO("2026-06-22", 1), "2026-06-23");
  assert.strictEqual(S.addDaysISO("2026-06-30", 1), "2026-07-01");
  assert.strictEqual(S.addDaysISO("2026-07-01", -1), "2026-06-30");
});

test("enumerateDays is inclusive and empty when reversed", () => {
  assert.deepStrictEqual(S.enumerateDays("2026-06-22", "2026-06-24"),
    ["2026-06-22", "2026-06-23", "2026-06-24"]);
  assert.deepStrictEqual(S.enumerateDays("2026-06-24", "2026-06-22"), []);
});

test("isoDow and isWeekend agree with the calendar", () => {
  assert.strictEqual(S.isoDow("2026-06-22"), "Mon");
  assert.strictEqual(S.isWeekend("2026-06-22"), false);
  assert.strictEqual(S.isWeekend("2026-06-28"), true); // Sunday
  assert.strictEqual(S.isWeekend("2026-06-27"), true); // Saturday
});

test("EST has the core difficulties", () => {
  assert.strictEqual(typeof S.EST.Easy, "number");
  assert.strictEqual(typeof S.EST.Medium, "number");
  assert.strictEqual(typeof S.EST.Hard, "number");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/schedule.test.js`
Expected: FAIL — `Cannot find module '../schedule.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `schedule.js`:

```js
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.Schedule = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var EST = { Easy: 25, Medium: 35, Hard: 50, Review: 30, Mock: 90, Behavioral: 40, System: 60 };

  function pad(n) { return String(n).padStart(2, "0"); }
  function isoOf(dt) { return dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate()); }
  function toDate(iso) { return new Date(iso + "T00:00"); }
  function toTime(iso) { return toDate(iso).getTime(); }

  function addDaysISO(iso, n) { var d = toDate(iso); d.setDate(d.getDate() + n); return isoOf(d); }

  function enumerateDays(startISO, endISO) {
    var out = [];
    if (startISO > endISO) return out;
    var cur = startISO, guard = 0;
    while (cur <= endISO && guard < 10000) { out.push(cur); cur = addDaysISO(cur, 1); guard++; }
    return out;
  }

  var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function isoDow(iso) { return DOW[toDate(iso).getDay()]; }
  function isWeekend(iso) { var g = toDate(iso).getDay(); return g === 0 || g === 6; }
  function fmtFull(iso) {
    return toDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return {
    EST: EST,
    addDaysISO: addDaysISO,
    enumerateDays: enumerateDays,
    isoDow: isoDow,
    isWeekend: isWeekend,
    fmtFull: fmtFull,
    _toTime: toTime
  };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/schedule.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add schedule.js tests/schedule.test.js
git commit -m "feat(schedule): engine scaffold with date helpers and EST map"
```

---

## Task 2: flattenStream + computePace

**Files:**
- Modify: `schedule.js`
- Test: `tests/schedule.test.js`

**Interfaces:**
- Consumes: helpers from Task 1.
- Produces:
  - `Schedule.flattenStream(rawDays) -> [{id, kind, cat, diff, title, phase, week, baselineDate}]`
    — `rawDays` is `DATA.days`; order is preserved exactly; `baselineDate` is the original day's `date`, `week` is the original day's `week`.
  - `Schedule.computePace({stream, done, todayISO}) -> {expected, actual, delta, paceDays, status}`
    — `expected` = problems whose `baselineDate <= todayISO`; `actual` = solved problems; `delta = actual - expected`; `paceDays` = whole days between today and the baseline date of the `actual`-th problem (positive = ahead); `status` ∈ `"ahead" | "behind" | "on-track"`.

- [ ] **Step 1: Write the failing test**

Append to `tests/schedule.test.js`:

```js
function fixtureDays() {
  // 2 weeks, weekday=1 problem, weekend has a push + a review. Dates are real.
  return [
    { date: "2026-06-22", week: 1, tasks: [{ id: "p1", kind: "problem", cat: "Arrays", diff: "Easy", title: "A", phase: "Foundations" }] },
    { date: "2026-06-23", week: 1, tasks: [{ id: "p2", kind: "problem", cat: "Arrays", diff: "Medium", title: "B", phase: "Foundations" }] },
    { date: "2026-06-28", week: 1, tasks: [
      { id: "p3", kind: "problem", cat: "Two Pointers", diff: "Easy", title: "C", phase: "Foundations" },
      { id: "r1", kind: "review", cat: "Review", diff: "Review", title: "Re-solve", phase: "Review" }
    ] },
    { date: "2026-06-29", week: 2, tasks: [{ id: "p4", kind: "problem", cat: "Stack", diff: "Medium", title: "D", phase: "Foundations" }] }
  ];
}

test("flattenStream preserves order and attaches baselineDate + week", () => {
  const s = S.flattenStream(fixtureDays());
  assert.deepStrictEqual(s.map(i => i.id), ["p1", "p2", "p3", "r1", "p4"]);
  assert.strictEqual(s[2].baselineDate, "2026-06-28");
  assert.strictEqual(s[2].week, 1);
  assert.strictEqual(s[3].kind, "review");
  assert.strictEqual(s[4].week, 2);
});

test("computePace reports behind when fewer solved than baseline expects", () => {
  const s = S.flattenStream(fixtureDays());
  // today is 2026-06-29: baseline expected p1,p2,p3 done (3 problems by/at today)
  const pace = S.computePace({ stream: s, done: { p1: true }, todayISO: "2026-06-29" });
  assert.strictEqual(pace.expected, 3);
  assert.strictEqual(pace.actual, 1);
  assert.strictEqual(pace.delta, -2);
  assert.strictEqual(pace.status, "behind");
});

test("computePace reports ahead when more solved than baseline expects", () => {
  const s = S.flattenStream(fixtureDays());
  // today 2026-06-23: baseline expects p1,p2 (2). Solved p1,p2,p3,p4 (4).
  const pace = S.computePace({ stream: s, done: { p1: true, p2: true, p3: true, p4: true }, todayISO: "2026-06-23" });
  assert.strictEqual(pace.expected, 2);
  assert.strictEqual(pace.actual, 4);
  assert.strictEqual(pace.delta, 2);
  assert.strictEqual(pace.status, "ahead");
  assert.ok(pace.paceDays > 0); // ahead of baseline by some days
});

test("computePace is on-track when solved equals expected", () => {
  const s = S.flattenStream(fixtureDays());
  const pace = S.computePace({ stream: s, done: { p1: true, p2: true }, todayISO: "2026-06-23" });
  assert.strictEqual(pace.delta, 0);
  assert.strictEqual(pace.status, "on-track");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/schedule.test.js`
Expected: FAIL — `S.flattenStream is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `schedule.js`, add these functions before the `return {…}` block:

```js
  function flattenStream(rawDays) {
    var out = [];
    rawDays.forEach(function (d) {
      d.tasks.forEach(function (t) {
        out.push({
          id: t.id, kind: t.kind, cat: t.cat, diff: t.diff, title: t.title,
          phase: t.phase, week: d.week, baselineDate: d.date
        });
      });
    });
    return out;
  }

  function computePace(opts) {
    var stream = opts.stream, done = opts.done || {}, todayISO = opts.todayISO;
    var problems = stream.filter(function (it) { return it.kind === "problem"; });
    var expected = problems.filter(function (it) { return it.baselineDate <= todayISO; }).length;
    var actual = problems.filter(function (it) { return done[it.id]; }).length;
    var delta = actual - expected;
    var refDate;
    if (actual === 0) refDate = problems.length ? problems[0].baselineDate : todayISO;
    else refDate = problems[Math.min(actual, problems.length) - 1].baselineDate;
    var paceDays = Math.round((toTime(refDate) - toTime(todayISO)) / 864e5);
    var status = delta > 0 ? "ahead" : (delta < 0 ? "behind" : "on-track");
    return { expected: expected, actual: actual, delta: delta, paceDays: paceDays, status: status };
  }
```

Then add `flattenStream: flattenStream,` and `computePace: computePace,` to the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/schedule.test.js`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add schedule.js tests/schedule.test.js
git commit -m "feat(schedule): flattenStream and computePace"
```

---

## Task 3: computeSchedule — caps, greedy fill, ride-along, no week mixing

**Files:**
- Modify: `schedule.js`
- Test: `tests/schedule.test.js`

**Interfaces:**
- Consumes: helpers from Task 1, `flattenStream` from Task 2.
- Produces:
  - `Schedule.computeSchedule({stream, done, todayISO, finishISO, weekdayCap=1, weekendCap=4, maxCap=8, slogans=[]}) -> {days, slipped, projectedFinish, finishedEarly}`
  - Each element of `days` is `{id:"d"+date, date, dow, full, week, phase, est, slogan, tasks}` where `tasks` are the stream items assigned to that day (same object shape flattenStream produces).
  - Rules implemented here: a computed day never mixes tasks from two different `week` values; problems fill up to the day's capacity; reviews/mocks "ride along" (attach to the current day without consuming problem capacity, but only within the same week); when behind, `weekdayCap`/`weekendCap` scale up together (capped at `maxCap`).

- [ ] **Step 1: Write the failing test**

Append to `tests/schedule.test.js`:

```js
test("on-track: keeps baseline rhythm, one problem per weekday", () => {
  const s = S.flattenStream(fixtureDays());
  const r = S.computeSchedule({
    stream: s, done: {}, todayISO: "2026-06-22", finishISO: "2026-07-31",
    slogans: ["go"]
  });
  // 4 problems, plenty of days -> each weekday gets exactly 1 problem
  const firstDay = r.days[0];
  assert.strictEqual(firstDay.date, "2026-06-22");
  assert.strictEqual(firstDay.tasks.filter(t => t.kind === "problem").length, 1);
  // every computed day holds at most weekend cap (4) problems
  r.days.forEach(d => assert.ok(d.tasks.filter(t => t.kind === "problem").length <= 4));
});

test("review rides along on the same day as its preceding problem's week", () => {
  const s = S.flattenStream(fixtureDays());
  const r = S.computeSchedule({
    stream: s, done: {}, todayISO: "2026-06-22", finishISO: "2026-07-31", slogans: ["go"]
  });
  // find the day containing r1; it must also be a week-1 day and contain p3 (its predecessor)
  const revDay = r.days.find(d => d.tasks.some(t => t.id === "r1"));
  assert.ok(revDay);
  assert.strictEqual(revDay.week, 1);
  assert.ok(revDay.tasks.some(t => t.id === "p3"));
});

test("a computed day never mixes two weeks", () => {
  const s = S.flattenStream(fixtureDays());
  const r = S.computeSchedule({
    stream: s, done: {}, todayISO: "2026-06-22", finishISO: "2026-06-25", slogans: ["go"]
  });
  r.days.forEach(d => {
    const weeks = new Set(d.tasks.map(t => t.week));
    assert.strictEqual(weeks.size, 1);
  });
});

test("behind: caps scale up so heavy backlog still fits before finish", () => {
  // 10 problems all in week 1, only 3 days until finish -> must pack >1/day
  const raw = [];
  for (let i = 1; i <= 10; i++) {
    raw.push({ date: "2026-06-2" + (i % 10), week: 1,
      tasks: [{ id: "q" + i, kind: "problem", cat: "Arrays", diff: "Easy", title: "Q" + i, phase: "F" }] });
  }
  const s = S.flattenStream(raw);
  const r = S.computeSchedule({
    stream: s, done: {}, todayISO: "2026-06-22", finishISO: "2026-06-24", slogans: ["go"]
  });
  const totalProblems = r.days.reduce((n, d) => n + d.tasks.filter(t => t.kind === "problem").length, 0);
  assert.strictEqual(totalProblems, 10);
  // 3 calendar days for 10 problems -> at least one day carries >1
  assert.ok(r.days.some(d => d.tasks.filter(t => t.kind === "problem").length > 1));
  assert.strictEqual(r.slipped, false);
});

test("ahead: solved problems are excluded; only remaining are scheduled", () => {
  const s = S.flattenStream(fixtureDays());
  const r = S.computeSchedule({
    stream: s, done: { p1: true, p2: true }, todayISO: "2026-06-24", finishISO: "2026-07-31", slogans: ["go"]
  });
  const ids = r.days.flatMap(d => d.tasks.map(t => t.id));
  assert.ok(!ids.includes("p1"));
  assert.ok(!ids.includes("p2"));
  assert.ok(ids.includes("p3"));
  assert.ok(ids.includes("p4"));
});

test("est is derived from task difficulties", () => {
  const s = S.flattenStream(fixtureDays());
  const r = S.computeSchedule({
    stream: s, done: {}, todayISO: "2026-06-22", finishISO: "2026-07-31", slogans: ["go"]
  });
  const d0 = r.days[0]; // single Easy problem
  assert.strictEqual(d0.est, S.EST.Easy);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/schedule.test.js`
Expected: FAIL — `S.computeSchedule is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `schedule.js`, add before the `return {…}` block:

```js
  function estOf(tasks) {
    var sum = 0;
    tasks.forEach(function (t) {
      var m = EST[t.diff];
      if (m == null) m = t.kind === "mock" ? EST.Mock : (t.kind === "review" ? EST.Review : 30);
      sum += m;
    });
    return sum;
  }

  function makeDay(date, tasks, slogan) {
    return {
      id: "d" + date, date: date, dow: isoDow(date), full: fmtFull(date),
      week: tasks[0].week, phase: tasks[0].phase, est: estOf(tasks),
      slogan: slogan || "", tasks: tasks
    };
  }

  function computeSchedule(opts) {
    var stream = opts.stream, done = opts.done || {}, todayISO = opts.todayISO,
        finishISO = opts.finishISO,
        weekdayCap = opts.weekdayCap || 1, weekendCap = opts.weekendCap || 4,
        maxCap = opts.maxCap || 8, slogans = opts.slogans || [];

    var remaining = stream.filter(function (it) { return !done[it.id]; });
    var remProblems = remaining.filter(function (it) { return it.kind === "problem"; }).length;

    // base slot count across today..finish
    var cal = enumerateDays(todayISO, finishISO);
    if (cal.length === 0) cal = [todayISO];
    var baseSlots = 0;
    cal.forEach(function (d) { baseSlots += isWeekend(d) ? weekendCap : weekdayCap; });

    var wdCap = weekdayCap, weCap = weekendCap;
    if (remProblems > baseSlots && baseSlots > 0) {
      var scale = remProblems / baseSlots;
      wdCap = Math.min(maxCap, Math.max(weekdayCap, Math.ceil(weekdayCap * scale)));
      weCap = Math.min(maxCap, Math.max(weekendCap, Math.ceil(weekendCap * scale)));
    }

    var days = [], ptr = 0, date = todayISO, sloIdx = 0, slipped = false;
    var sloMod = slogans.length || 1;
    while (ptr < remaining.length) {
      var cap = isWeekend(date) ? weCap : wdCap;
      var dayTasks = [], probCount = 0, curWeek = null;
      while (ptr < remaining.length) {
        var it = remaining[ptr];
        if (dayTasks.length > 0 && it.week !== curWeek) break;           // no week mixing
        if (it.kind === "problem") {
          if (probCount >= cap) break;
          dayTasks.push(it); probCount++; curWeek = it.week; ptr++;
        } else {
          if (dayTasks.length === 0 || it.week === curWeek) {
            dayTasks.push(it); if (curWeek === null) curWeek = it.week; ptr++;
          } else break;
        }
      }
      if (dayTasks.length > 0) {
        days.push(makeDay(date, dayTasks, slogans[sloIdx % sloMod]));
        sloIdx++;
      }
      if (ptr >= remaining.length) break;
      date = addDaysISO(date, 1);
      if (date > finishISO) slipped = true;
    }

    var projectedFinish = days.length ? days[days.length - 1].date : todayISO;
    var finishedEarly = projectedFinish < finishISO;
    return { days: days, slipped: slipped, projectedFinish: projectedFinish, finishedEarly: finishedEarly };
  }
```

Then add `computeSchedule: computeSchedule,` to the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/schedule.test.js`
Expected: PASS (all tests through Task 3).

- [ ] **Step 5: Commit**

```bash
git add schedule.js tests/schedule.test.js
git commit -m "feat(schedule): adaptive computeSchedule with scaling, ride-along, week isolation"
```

---

## Task 4: computeSchedule edge cases — slip, finished-early, empty

**Files:**
- Modify: `schedule.js` (only if a test reveals a gap — implementation from Task 3 already targets these)
- Test: `tests/schedule.test.js`

**Interfaces:**
- Consumes: `computeSchedule` from Task 3. No new exports.

- [ ] **Step 1: Write the failing test**

Append to `tests/schedule.test.js`:

```js
test("slip: backlog beyond max capacity pushes finish past the target date", () => {
  // 30 problems, 1 day window, maxCap 8 -> cannot fit; date must slip, all still scheduled
  const raw = [];
  for (let i = 1; i <= 30; i++) {
    raw.push({ date: "2026-06-22", week: 1,
      tasks: [{ id: "z" + i, kind: "problem", cat: "Arrays", diff: "Easy", title: "Z" + i, phase: "F" }] });
  }
  const s = S.flattenStream(raw);
  const r = S.computeSchedule({
    stream: s, done: {}, todayISO: "2026-06-22", finishISO: "2026-06-22", maxCap: 8, slogans: ["go"]
  });
  const total = r.days.reduce((n, d) => n + d.tasks.length, 0);
  assert.strictEqual(total, 30);                  // nothing dropped
  assert.strictEqual(r.slipped, true);
  assert.ok(r.projectedFinish > "2026-06-22");     // finish slipped later
  r.days.forEach(d => assert.ok(d.tasks.length <= 8)); // honored the cap
});

test("finished-early: ahead work means projected finish is before the target", () => {
  const s = S.flattenStream(fixtureDays());
  const r = S.computeSchedule({
    stream: s, done: {}, todayISO: "2026-06-22", finishISO: "2026-12-31", slogans: ["go"]
  });
  assert.strictEqual(r.finishedEarly, true);
  assert.ok(r.projectedFinish < "2026-12-31");
});

test("empty: everything done yields no days and not slipped", () => {
  const s = S.flattenStream(fixtureDays());
  const allDone = {}; s.forEach(it => { allDone[it.id] = true; });
  const r = S.computeSchedule({
    stream: s, done: allDone, todayISO: "2026-06-22", finishISO: "2026-07-31", slogans: ["go"]
  });
  assert.strictEqual(r.days.length, 0);
  assert.strictEqual(r.slipped, false);
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `node --test tests/schedule.test.js`
Expected: These should PASS against the Task 3 implementation. If any FAILS, fix `computeSchedule` minimally:
- If the empty case throws, guard `projectedFinish`/loop for `remaining.length === 0` (already handled: the `while` never enters, `days=[]`, `projectedFinish=todayISO`, `finishedEarly` = `todayISO < finishISO` = `true`).
- NOTE: for the empty case `finishedEarly` will be `true` (today is before finish). The test only asserts `days.length===0` and `slipped===false`, so this is fine; do not change behavior to satisfy a stricter reading.

- [ ] **Step 3: Implement fixes only if needed**

If a test failed, make the minimal change in `computeSchedule` to satisfy it, keeping all earlier tests green. If all passed, no code change.

- [ ] **Step 4: Run the full test file**

Run: `node --test tests/schedule.test.js`
Expected: PASS (entire suite).

- [ ] **Step 5: Commit**

```bash
git add schedule.js tests/schedule.test.js
git commit -m "test(schedule): cover slip, finished-early, and empty cases"
```

---

## Task 5: Wire the engine into the plan page

**Files:**
- Modify: `neetcode150-plan.html`
  - Add `<script src="schedule.js"></script>` before the inline `<script>` (the inline block starts around line 211; the script tag goes just above it, after the closing `</div>`/`</body>`-area markup — place it immediately before the existing `<script>` that defines `DATA`).
  - Replace the `days`/`meta`/`FOCUS` setup (lines ~237–249) and `streak()` (lines ~294–300) and the `remainingDays` calc in `renderStats` (line ~305).

**Interfaces:**
- Consumes: `window.Schedule.{flattenStream, computeSchedule, computePace, fmtFull}`.
- Produces: a global `days` array (computed), a global `BASELINE` array (the original `DATA.days`), and `SCHED` (the full `computeSchedule` result) used by Task 6.

- [ ] **Step 1: Add the script tag**

Find the line just before the inline script that defines `DATA` (the `<script>` opening near line 211). Add immediately above it:

```html
<script src="schedule.js"></script>
```

- [ ] **Step 2: Replace the days/meta/focus setup**

Find (around lines 237–249):

```js
const days=DATA.days, meta=DATA.meta;
const allProblems=[]; days.forEach(d=>d.tasks.forEach(t=>{ if(t.kind==="problem") allProblems.push(t.id); }));
const isProblem=id=>id&&id[0]==="p";

// focus day = today if in plan, else first day on/after today, else last day
function focusIndex(){
  let i=days.findIndex(d=>d.date===todayISO);
  if(i>=0) return i;
  i=days.findIndex(d=>d.date>todayISO);
  if(i>=0) return i;
  return days.length-1;
}
const FOCUS=focusIndex();
```

Replace with:

```js
const meta=DATA.meta;
const BASELINE=DATA.days;                       // original calendar: drives streak + pace "expected"
const STREAM=Schedule.flattenStream(BASELINE);
const SLOGANS=BASELINE.map(d=>d.slogan);
const allProblems=[]; STREAM.forEach(t=>{ if(t.kind==="problem") allProblems.push(t.id); });
const isProblem=id=>id&&id[0]==="p";

let SCHED=Schedule.computeSchedule({
  stream:STREAM, done:STATE.done, todayISO, finishISO:meta.end,
  weekdayCap:1, weekendCap:4, maxCap:8, slogans:SLOGANS
});
let days=SCHED.days;

// focus day = first computed day on/after today, else last computed day
function focusIndex(){
  if(days.length===0) return 0;
  let i=days.findIndex(d=>d.date===todayISO);
  if(i>=0) return i;
  i=days.findIndex(d=>d.date>todayISO);
  if(i>=0) return i;
  return days.length-1;
}
let FOCUS=focusIndex();

function recompute(){
  SCHED=Schedule.computeSchedule({
    stream:STREAM, done:STATE.done, todayISO, finishISO:meta.end,
    weekdayCap:1, weekendCap:4, maxCap:8, slogans:SLOGANS
  });
  days=SCHED.days; FOCUS=focusIndex();
}
```

NOTE: `STATE` is defined above this block (line ~218) so `STATE.done` is available. `days` and `FOCUS` are now `let`, not `const`, because `recompute()` reassigns them.

- [ ] **Step 3: Recompute the schedule after state changes and on load**

Find `setDone` (lines ~397–404):

```js
function setDone(id,val){
  if(val) STATE.done[id]=true; else delete STATE.done[id];
  // sync every checkbox with same id (focus panel + plan)
  document.querySelectorAll(`.task[data-id="${id}"]`).forEach(row=>{
    row.classList.toggle("done",val); const cb=row.querySelector(".cb"); if(cb)cb.checked=val;
  });
  save(); renderStats(); renderClimb(); updateWeekBars();
}
```

Replace its body with a version that recomputes and repaints (the calendar shifts when you check things off, so a full repaint is required):

```js
function setDone(id,val){
  if(val) STATE.done[id]=true; else delete STATE.done[id];
  save(); recompute(); paint();
}
```

Then find the boot block (line ~479):

```js
(async function(){ await load(); init(false); })();
```

Replace with:

```js
(async function(){ await load(); recompute(); init(false); })();
```

(`load()` populates `STATE.done`; the first `computeSchedule` at definition time ran before load, so we recompute once after load.)

- [ ] **Step 4: Repoint streak() and remainingDays at BASELINE**

Find `streak()` (lines ~294–300) and replace `days` with `BASELINE`:

```js
function streak(){
  // consecutive fully-completed baseline days ending at last baseline day on/before today
  let last=BASELINE.findIndex(d=>d.date>todayISO); if(last===-1) last=BASELINE.length;
  let s=0;
  for(let i=last-1;i>=0;i--){ if(BASELINE[i].tasks.every(t=>STATE.done[t.id])) s++; else break; }
  return s;
}
```

Find the `remainingDays` line in `renderStats` (line ~305):

```js
  const remainingDays=Math.max(0, days.filter(d=>d.date>=todayISO).length);
```

Replace with (computed days already start at today):

```js
  const remainingDays=days.length;
```

- [ ] **Step 5: Verify the engine loads and the page renders (manual)**

Because this is DOM wiring with no browser test harness, verify by hand.

1. Confirm tests still green: `node --test tests/schedule.test.js` → PASS.
2. Open `neetcode150-plan.html` in a browser via `file://`.
3. Open DevTools console. Expected: NO errors (especially no "Schedule is not defined").
4. In the console run:
   ```js
   localStorage.removeItem("nc150:v1"); location.reload();
   ```
   Expected after reload: the first day card shown is today's date (or the first plan day if today is before the plan starts), weekdays show ~1 problem, weekends show several.
5. Simulate being behind — in the console:
   ```js
   localStorage.setItem("nc150:v1", JSON.stringify({done:{},flag:{}})); location.reload();
   ```
   Then check several problems far in the future as done via the UI and reload; confirm those problems disappear from upcoming days (remaining-only scheduling) and the "Problems solved" stat rises.
6. Confirm week sections still render with their numbers and that no single day card lists two different week numbers.

- [ ] **Step 6: Commit**

```bash
git add neetcode150-plan.html
git commit -m "feat(plan): render adaptive computed schedule from engine"
```

---

## Task 6: Pace badge + finish-status indicator

**Files:**
- Modify: `neetcode150-plan.html`
  - Add a pace badge to the stats row (or hero) and a finish-status line to the focus panel header.

**Interfaces:**
- Consumes: `Schedule.computePace`, the global `SCHED` (`{slipped, projectedFinish, finishedEarly}`), `Schedule.fmtFull`.

- [ ] **Step 1: Add a pace badge to renderStats**

In `renderStats`, after computing `solved`, add a pace computation and a fourth/extra stat tile. Find the closing of the stats `innerHTML` template (line ~310):

```js
    <div class="stat"><div class="n">${remainingDays}</div><div class="l">Study days left</div></div>`;
```

Replace with:

```js
    <div class="stat"><div class="n">${remainingDays}</div><div class="l">Study days left</div></div>
    <div class="stat pace ${pace.status}"><div class="n">${paceLabel}</div><div class="l">${paceSub}</div></div>`;
```

And immediately above the `document.getElementById("stats").innerHTML=` line, add:

```js
  const pace=Schedule.computePace({stream:STREAM, done:STATE.done, todayISO});
  const paceLabel = pace.status==="on-track" ? "On track"
    : (pace.delta>0?`+${pace.delta}`:`${pace.delta}`);
  const paceSub = pace.status==="ahead" ? `Ahead · ${Math.abs(pace.paceDays)}d buffer`
    : pace.status==="behind" ? `Behind · ${Math.abs(pace.delta)} to catch up`
    : "Right on pace";
```

- [ ] **Step 2: Add pace badge styling**

In the `<style>` block, after the `.stat.streak .n` rule (line ~60), add:

```css
.stat.pace.ahead .n{color:var(--mint)}
.stat.pace.behind .n{color:var(--coral)}
.stat.pace.on-track .n{color:var(--peri)}
```

- [ ] **Step 3: Add a finish-status line to the focus panel**

In `renderFocus`, find the `~${d.est} min` cell (line ~390):

```js
      <div style="font-family:var(--mono);font-size:11px;color:var(--faint)">~${d.est} min</div>
```

Replace with:

```js
      <div style="font-family:var(--mono);font-size:11px;color:var(--faint)">~${d.est} min${finishNote}</div>
```

And at the top of `renderFocus`, after `const d=days[FOCUS];`, add a guard for the empty (all-done) case and the finish note:

```js
  if(!d){ document.getElementById("focus").innerHTML=`<div class="slogan" style="padding:18px 20px">🎉 All tasks complete — every problem solved. Nicely done.</div>`; return; }
  const finishNote = SCHED.slipped
    ? ` · ⚠ finish slips to ${Schedule.fmtFull(SCHED.projectedFinish)}`
    : (SCHED.finishedEarly ? ` · on pace to finish ${Schedule.fmtFull(SCHED.projectedFinish)}` : "");
```

NOTE: `days[FOCUS]` can be `undefined` only when `days` is empty (everything done); the guard handles that.

- [ ] **Step 4: Verify pace UI (manual)**

1. `node --test tests/schedule.test.js` → PASS (no engine change, sanity only).
2. Open `neetcode150-plan.html` via `file://`.
3. Behind state — console:
   ```js
   localStorage.setItem("nc150:v1", JSON.stringify({done:{},flag:{}})); location.reload();
   ```
   Since today (2026-06-22 in dev) is the start, expect roughly "On track" or a small number. To force "behind", temporarily check nothing and confirm the badge reads behind once the baseline expects more than 0 (i.e., on any date after the first scheduled problem).
4. Ahead state — check several problems done via the UI, reload. Expect the pace tile to turn mint and read `+N` with an "Ahead · Nd buffer" sublabel.
5. Slip state — to exercise the warning, in console temporarily mark only the last handful of problems undone and the rest done very late is hard to simulate; instead trust the engine's unit test for `slipped` and just confirm the focus header shows the "on pace to finish …" note when ahead (finishedEarly), and shows no error when on track.
6. All-done state — console:
   ```js
   (function(){const k="nc150:v1";const st={done:{},flag:{}};for(let i=1;i<=150;i++){st.done["p"+String(i).padStart(3,"0")]=true;}localStorage.setItem(k,JSON.stringify(st));location.reload();})();
   ```
   Expect the focus panel to show the 🎉 all-complete message and no console errors.
7. Restore your real progress afterward (or `localStorage.removeItem("nc150:v1")`).

- [ ] **Step 5: Commit**

```bash
git add neetcode150-plan.html
git commit -m "feat(plan): pace badge and finish-status indicator"
```

---

## Self-Review

**Spec coverage:**
- §1 Core model (dynamic recompute, no migration) → Tasks 1–4 (engine), Task 5 (wiring, no schema change). ✓
- §2 Engine (capacity `max(baseline, catch-up)`, ride-along, flow-forward) → Task 3. ✓
- §3 Ahead/behind via `max()` → Task 3 (`scale` only raises caps; baseline floor preserved) + Task 4 (finished-early). ✓
- §4 Pace badge (`expected`/`actual`/delta/days) → Task 2 (`computePace`) + Task 6 (UI). ✓
- §5 Fallbacks: slip → Task 4 + Task 6 warning; finished-early → Task 4 + Task 6 note; weeks/phases preserved → Task 3 (no week mixing) + existing `renderPlan` grouping; today-not-in-window → Task 5 `focusIndex`. ✓
- §6 Code impact (html + computeSchedule; storage/filters/flag untouched) → Tasks 5–6 leave `save`/filters/flag logic unchanged. ✓ (Refinement vs spec: the engine lives in a sibling `schedule.js` rather than inline, for testability — noted in Architecture. Dashboard and other plans untouched, per Global Constraints.)

**Placeholder scan:** No TBD/TODO; every code step shows complete code; manual-verification steps give exact console snippets and expected observations. ✓

**Type consistency:** `flattenStream` item shape `{id,kind,cat,diff,title,phase,week,baselineDate}` is consumed unchanged by `computePace` (`kind`,`baselineDate`) and `computeSchedule` (`week`,`kind`,`diff`,`phase`). `computeSchedule` day shape `{id,date,dow,full,week,phase,est,slogan,tasks}` matches what `dayHTML`/`weekHTML`/`renderFocus`/`renderPlan` already read. `SCHED.{slipped,projectedFinish,finishedEarly}` used in Task 6 matches Task 3's return. `recompute()` reassigns the `let days`/`let FOCUS` introduced in Task 5. ✓

**Known minor behaviors (intentional, documented):**
- Computed schedule has no dedicated "rest days"; weekdays stay light (1/problem) so rest is implicit.
- Authored per-day slogans are reused as an ordered pool consumed by computed-day index (detached from specific dates).
- A computed day belongs to exactly one week; at a week boundary a day may under-fill its capacity rather than mixing weeks.

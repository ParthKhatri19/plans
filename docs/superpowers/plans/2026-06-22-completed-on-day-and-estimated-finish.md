# Completed-on-day timeline + estimated finish date — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep finished NeetCode problems visible under the day they were actually checked off (a continuous history → today → future timeline), and surface an always-visible estimated finish date.

**Architecture:** Add a `computeTimeline()` wrapper in `schedule.js` that augments the existing adaptive future schedule with "history" days built from completed tasks grouped by their recorded completion date (falling back to the baseline date). The plan page records a completion date per task in a new `STATE.at` map, swaps its `computeSchedule` calls for `computeTimeline`, sorts each Week accordion's days by date, and shows the engine's `projectedFinish` as a stat.

**Tech Stack:** Vanilla HTML/CSS/JS, no build step. Engine is a UMD module (`schedule.js`) unit-tested with Node's built-in test runner (`node:test`). The plan page is opened directly in a browser; its DOM glue is verified manually in the browser console.

## Global Constraints

- No build step, no dependencies beyond Google Fonts. Plain ES5-style JS to match `schedule.js`.
- `STATE.done[id]` MUST remain a plain boolean `true` so the dashboard's `Object.values(state.done).filter(Boolean).length` count keeps working.
- `localStorage` key is `"nc150:v1"`; state schema additions must stay backward-compatible (missing `at` is valid).
- Engine: do not change `computeSchedule`, `computePace`, or any existing export signature. Only add `computeTimeline`.
- Dates are ISO `YYYY-MM-DD` strings, comparable lexicographically (as the existing code already relies on).

---

### Task 1: `computeTimeline` engine function

**Files:**
- Modify: `schedule.js` (add function before the `return {...}` export block at `schedule.js:129`; add export key inside it)
- Test: `tests/schedule.test.js` (append)

**Interfaces:**
- Consumes (already in `schedule.js`): `computeSchedule(opts)`, `makeDay(date, tasks, slogan)`, `estOf(tasks)`, and stream items shaped `{ id, kind, cat, diff, title, phase, week, baselineDate }` (from `flattenStream`).
- Produces:
  - `computeTimeline(opts)` where `opts` is the same object accepted by `computeSchedule` (`stream, done, todayISO, finishISO, weekdayCap, weekendCap, maxCap, slogans`) **plus** `at` (map `id -> ISO date`) and `sloganByDate` (map `ISO date -> string`).
  - Returns `{ days, history, future, slipped, projectedFinish, finishedEarly }`:
    - `days`: full chronological array (history days then future days), each a day object as built by `makeDay` / `computeSchedule` (`{ id, date, dow, full, week, phase, est, slogan, tasks }`).
    - `history`: array of past day objects (date `< todayISO`), built from completed tasks.
    - `future`: the `days` array from `computeSchedule` (today onward), with today's card mutated to include any work completed today.
    - `slipped`, `projectedFinish`, `finishedEarly`: passed through unchanged from `computeSchedule`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/schedule.test.js`:

```javascript
test("computeTimeline places a completed problem on its recorded completion date", () => {
  const s = S.flattenStream(fixtureDays());
  const r = S.computeTimeline({
    stream: s, done: { p1: true }, at: { p1: "2026-06-19" },
    todayISO: "2026-06-25", finishISO: "2026-07-31", slogans: ["go"]
  });
  const h = r.history.find(d => d.date === "2026-06-19");
  assert.ok(h, "history day exists on the recorded completion date");
  assert.ok(h.tasks.some(t => t.id === "p1"));
});

test("computeTimeline falls back to the baseline date when no completion date is recorded", () => {
  const s = S.flattenStream(fixtureDays());
  const r = S.computeTimeline({
    stream: s, done: { p1: true }, at: {},
    todayISO: "2026-06-25", finishISO: "2026-07-31", slogans: ["go"]
  });
  const h = r.history.find(d => d.date === "2026-06-22"); // p1's baseline date
  assert.ok(h, "history day exists on the baseline date");
  assert.ok(h.tasks.some(t => t.id === "p1"));
});

test("computeTimeline merges work completed today into today's card, completed first", () => {
  const s = S.flattenStream(fixtureDays());
  const r = S.computeTimeline({
    stream: s, done: { p1: true }, at: { p1: "2026-06-22" },
    todayISO: "2026-06-22", finishISO: "2026-07-31", slogans: ["go"]
  });
  assert.strictEqual(r.history.find(d => d.date === "2026-06-22"), undefined,
    "no standalone history day for today");
  const today = r.days.find(d => d.date === "2026-06-22");
  assert.ok(today);
  const ids = today.tasks.map(t => t.id);
  assert.ok(ids.includes("p1"), "completed-today task present");
  assert.ok(ids.includes("p2"), "remaining-today task present");
  assert.strictEqual(ids[0], "p1", "completed task listed first");
});

test("computeTimeline drops a task from history when it is no longer done", () => {
  const s = S.flattenStream(fixtureDays());
  const r = S.computeTimeline({
    stream: s, done: {}, at: {},
    todayISO: "2026-06-22", finishISO: "2026-07-31", slogans: ["go"]
  });
  assert.strictEqual(r.history.length, 0);
  const futureIds = r.future.flatMap(d => d.tasks.map(t => t.id));
  assert.ok(futureIds.includes("p1"), "uncompleted task returns to the adaptive future");
});

test("computeTimeline exposes the same finish projection as computeSchedule", () => {
  const s = S.flattenStream(fixtureDays());
  const opts = { stream: s, done: { p1: true }, todayISO: "2026-06-22",
    finishISO: "2026-07-31", slogans: ["go"] };
  const sched = S.computeSchedule(opts);
  const tl = S.computeTimeline(Object.assign({ at: {} }, opts));
  assert.strictEqual(tl.projectedFinish, sched.projectedFinish);
  assert.strictEqual(tl.slipped, sched.slipped);
  assert.strictEqual(tl.finishedEarly, sched.finishedEarly);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/schedule.test.js`
Expected: FAIL — `TypeError: S.computeTimeline is not a function` for the new tests; all pre-existing tests still PASS.

- [ ] **Step 3: Implement `computeTimeline`**

In `schedule.js`, insert this function immediately before the `return {` export block (currently at `schedule.js:129`):

```javascript
function computeTimeline(opts) {
  var future = computeSchedule(opts);
  var stream = opts.stream, done = opts.done || {}, at = opts.at || {},
      todayISO = opts.todayISO, sloganByDate = opts.sloganByDate || {};

  // group completed tasks by completion date (recorded date, else baseline date)
  var byDate = {};
  stream.forEach(function (it) {
    if (!done[it.id]) return;
    var d = at[it.id] || it.baselineDate;
    (byDate[d] = byDate[d] || []).push(it);   // stream order preserved
  });

  // merge work completed today into today's adaptive card, completed-first
  var futureToday = null;
  future.days.forEach(function (d) { if (d.date === todayISO) futureToday = d; });
  if (futureToday && byDate[todayISO]) {
    futureToday.tasks = byDate[todayISO].concat(futureToday.tasks);
    futureToday.est = estOf(futureToday.tasks);
    delete byDate[todayISO];
  }

  // build history days for the remaining completed dates
  var history = Object.keys(byDate).sort().map(function (date) {
    return makeDay(date, byDate[date], sloganByDate[date] || "");
  });

  return {
    days: history.concat(future.days),
    history: history,
    future: future.days,
    slipped: future.slipped,
    projectedFinish: future.projectedFinish,
    finishedEarly: future.finishedEarly
  };
}
```

Then add the export. Change the export block's last entry (`schedule.js:139`) from:

```javascript
    computeSchedule: computeSchedule
  };
```

to:

```javascript
    computeSchedule: computeSchedule,
    computeTimeline: computeTimeline
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/schedule.test.js`
Expected: PASS — all tests (existing + 5 new) pass.

- [ ] **Step 5: Commit**

```bash
git add schedule.js tests/schedule.test.js
git commit -m "feat(schedule): add computeTimeline for completed-on-day history"
```

---

### Task 2: Record completion date in plan state

**Files:**
- Modify: `neetcode150-plan.html:222` (state init), `:225-226` (load), `:430-433` (`setDone`), `:497` (reset)

**Interfaces:**
- Consumes: `todayISO` (already defined at `neetcode150-plan.html:240`).
- Produces: `STATE.at` — a map `taskId -> ISO date string` written whenever a task is checked done, deleted on uncheck. Read by Task 3.

- [ ] **Step 1: Add `at` to the state object**

Change `neetcode150-plan.html:222` from:

```javascript
let STATE={done:{},flag:{}};
```

to:

```javascript
let STATE={done:{},flag:{},at:{}};
```

- [ ] **Step 2: Load the `at` map from storage**

Change `neetcode150-plan.html:225-226` from:

```javascript
    if(hasStore){ const r=await window.storage.get(KEY); if(r&&r.value){ const p=JSON.parse(r.value); STATE.done=p.done||{}; STATE.flag=p.flag||{}; return; } }
    const ls=localStorage.getItem(KEY); if(ls){ const p=JSON.parse(ls); STATE.done=p.done||{}; STATE.flag=p.flag||{}; }
```

to:

```javascript
    if(hasStore){ const r=await window.storage.get(KEY); if(r&&r.value){ const p=JSON.parse(r.value); STATE.done=p.done||{}; STATE.flag=p.flag||{}; STATE.at=p.at||{}; return; } }
    const ls=localStorage.getItem(KEY); if(ls){ const p=JSON.parse(ls); STATE.done=p.done||{}; STATE.flag=p.flag||{}; STATE.at=p.at||{}; }
```

- [ ] **Step 3: Record/clear the date in `setDone`**

Change `neetcode150-plan.html:430-433` from:

```javascript
function setDone(id,val){
  if(val) STATE.done[id]=true; else delete STATE.done[id];
  save(); recompute(); paint();
}
```

to:

```javascript
function setDone(id,val){
  if(val){ STATE.done[id]=true; STATE.at[id]=todayISO; }
  else { delete STATE.done[id]; delete STATE.at[id]; }
  save(); recompute(); paint();
}
```

- [ ] **Step 4: Clear `at` on reset**

Change `neetcode150-plan.html:497` from:

```javascript
    STATE={done:{},flag:{}}; save(); init(true);
```

to:

```javascript
    STATE={done:{},flag:{},at:{}}; save(); init(true);
```

- [ ] **Step 5: Verify in the browser**

Open `neetcode150-plan.html` in a browser. In the DevTools console:

```javascript
// check a problem box in the UI, then:
JSON.parse(localStorage["nc150:v1"]).at
```

Expected: an object mapping the checked task's id to today's date (e.g. `{ p001: "2026-06-22" }`). Uncheck it; re-run — the id is gone. The dashboard count is unaffected (`done` still holds the boolean while checked).

- [ ] **Step 6: Commit**

```bash
git add neetcode150-plan.html
git commit -m "feat(plan): record completion date per task in STATE.at"
```

---

### Task 3: Render the unified timeline

**Files:**
- Modify: `neetcode150-plan.html` — add a slogan-by-date map near `:244`; swap both `computeSchedule` call sites (`:248-251`, `:266-270`); `renderPlan` (`:394-400`); `dayHTML` (`:368-381`)

**Interfaces:**
- Consumes: `Schedule.computeTimeline` (Task 1), `STATE.at` (Task 2), existing `BASELINE`, `STREAM`, `SLOGANS`, `meta`, `todayISO`, `dayComplete(d)` (`:273`).
- Produces: `SCHED` now comes from `computeTimeline`; `days = SCHED.days` is the full history+future list. `SCHED.projectedFinish` is consumed by Task 4.

- [ ] **Step 1: Build a date→slogan map**

After `neetcode150-plan.html:244` (`const SLOGANS=BASELINE.map(d=>d.slogan);`), add:

```javascript
const SLOGAN_BY_DATE={}; BASELINE.forEach(d=>{ SLOGAN_BY_DATE[d.date]=d.slogan; });
```

- [ ] **Step 2: Swap the initial schedule build to `computeTimeline`**

Change `neetcode150-plan.html:248-251` from:

```javascript
let SCHED=Schedule.computeSchedule({
  stream:STREAM, done:STATE.done, todayISO, finishISO:meta.end,
  weekdayCap:1, weekendCap:4, maxCap:8, slogans:SLOGANS
});
```

to:

```javascript
let SCHED=Schedule.computeTimeline({
  stream:STREAM, done:STATE.done, at:STATE.at, sloganByDate:SLOGAN_BY_DATE,
  todayISO, finishISO:meta.end,
  weekdayCap:1, weekendCap:4, maxCap:8, slogans:SLOGANS
});
```

- [ ] **Step 3: Swap the `recompute` build too**

Change `neetcode150-plan.html:266-270` from:

```javascript
  SCHED=Schedule.computeSchedule({
    stream:STREAM, done:STATE.done, todayISO, finishISO:meta.end,
    weekdayCap:1, weekendCap:4, maxCap:8, slogans:SLOGANS
  });
```

to:

```javascript
  SCHED=Schedule.computeTimeline({
    stream:STREAM, done:STATE.done, at:STATE.at, sloganByDate:SLOGAN_BY_DATE,
    todayISO, finishISO:meta.end,
    weekdayCap:1, weekendCap:4, maxCap:8, slogans:SLOGANS
  });
```

- [ ] **Step 4: Sort each week's days by date in `renderPlan`**

Change `neetcode150-plan.html:394-398` from:

```javascript
function renderPlan(){
  const byWeek={};
  days.forEach(d=>{ (byWeek[d.week]=byWeek[d.week]||[]).push(d); });
  const html=Object.keys(byWeek).map(w=>weekHTML(w,byWeek[w])).join("")+`<div class="empty hidden" id="empty">No tasks match your filter.</div>`;
  document.getElementById("plan").innerHTML=html;
```

to:

```javascript
function renderPlan(){
  const byWeek={};
  days.forEach(d=>{ (byWeek[d.week]=byWeek[d.week]||[]).push(d); });
  Object.values(byWeek).forEach(list=>list.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0));
  const weeks=Object.keys(byWeek).sort((a,b)=>a-b);
  const html=weeks.map(w=>weekHTML(w,byWeek[w])).join("")+`<div class="empty hidden" id="empty">No tasks match your filter.</div>`;
  document.getElementById("plan").innerHTML=html;
```

- [ ] **Step 5: Add a "done" marker and guard the empty slogan in `dayHTML`**

Change `neetcode150-plan.html:368-381` from:

```javascript
function dayHTML(d){
  const isToday=d.date===todayISO || (d.date===days[FOCUS].date && !days.some(x=>x.date===todayISO));
  const dd=new Date(d.date+"T00:00");
  const pill=dd.toLocaleDateString("en-US",{month:"short",day:"numeric"});
  return `<div class="day ${isToday?'today':''}" id="${d.id}" data-date="${d.date}">
    <div class="dhead">
      <span class="dpill">${pill}</span>
      <span class="ddow">${d.dow}</span>
      <span class="dest">~${d.est} min</span>
    </div>
    <div class="dslogan">“${d.slogan}”</div>
    <div class="tasks">${d.tasks.map(t=>taskHTML(t,d.dow)).join("")}</div>
  </div>`;
}
```

to:

```javascript
function dayHTML(d){
  const isToday=d.date===todayISO || (d.date===days[FOCUS].date && !days.some(x=>x.date===todayISO));
  const dd=new Date(d.date+"T00:00");
  const pill=dd.toLocaleDateString("en-US",{month:"short",day:"numeric"});
  const doneMark=dayComplete(d)?`<span class="ddone">✓ done</span>`:"";
  const slogan=d.slogan?`<div class="dslogan">“${d.slogan}”</div>`:"";
  return `<div class="day ${isToday?'today':''} ${dayComplete(d)?'daydone':''}" id="${d.id}" data-date="${d.date}">
    <div class="dhead">
      <span class="dpill">${pill}</span>
      <span class="ddow">${d.dow}</span>
      <span class="dest">~${d.est} min</span>
      ${doneMark}
    </div>
    ${slogan}
    <div class="tasks">${d.tasks.map(t=>taskHTML(t,d.dow)).join("")}</div>
  </div>`;
}
```

- [ ] **Step 6: Add styling for the done marker**

Find the `.dhead` / `.dpill` CSS rules (search the `<style>` block for `.dpill`) and add these two rules immediately after the `.dpill { ... }` rule:

```css
.ddone{margin-left:auto;font-family:var(--mono);font-size:10px;letter-spacing:.04em;color:var(--mint);text-transform:uppercase}
.daydone .dpill{color:var(--mint)}
```

- [ ] **Step 7: Verify in the browser**

Open `neetcode150-plan.html`. In the DevTools console, simulate a problem completed on an earlier day, then reload:

```javascript
const k="nc150:v1", s=JSON.parse(localStorage[k]);
s.done.p001=true; s.at.p001="2026-06-19";   // a date before today
localStorage[k]=JSON.stringify(s); location.reload();
```

Expected: after reload, `p001` appears under a **Jun 19** day card inside the Week 1 accordion, rendered with the struck/`.done` style and a "✓ done" marker on a fully-complete day. Days within the week are ordered by date. The "Completed" filter chip now shows completed tasks. Checking a box for today still shows it on today's card.

Clean up the test data when done:

```javascript
const k="nc150:v1", s=JSON.parse(localStorage[k]);
delete s.done.p001; delete s.at.p001;
localStorage[k]=JSON.stringify(s); location.reload();
```

- [ ] **Step 8: Commit**

```bash
git add neetcode150-plan.html
git commit -m "feat(plan): render completed problems on a unified day-by-day timeline"
```

---

### Task 4: Estimated finish date stat

**Files:**
- Modify: `neetcode150-plan.html` — `renderStats` (`:334-339`)

**Interfaces:**
- Consumes: `SCHED.projectedFinish` (Task 3), `Schedule.fmtFull` (existing export).
- Produces: a visible "Est. finish" tile in the stats row.

- [ ] **Step 1: Add the Est. finish tile**

Change `neetcode150-plan.html:334-339` from:

```javascript
  document.getElementById("stats").innerHTML=`
    <div class="stat solved"><div class="n">${solved}<span style="font-size:15px;color:var(--faint)">/150</span></div><div class="l">Problems solved</div></div>
    <div class="stat"><div class="n">${pct}%</div><div class="l">Course complete</div></div>
    <div class="stat streak"><div class="n">${streak()}</div><div class="l">Day streak 🔥</div></div>
    <div class="stat"><div class="n">${remainingDays}</div><div class="l">Study days left</div></div>
    <div class="stat pace ${pace.status}"><div class="n">${paceLabel}</div><div class="l">${paceSub}</div></div>`;
```

to:

```javascript
  document.getElementById("stats").innerHTML=`
    <div class="stat solved"><div class="n">${solved}<span style="font-size:15px;color:var(--faint)">/150</span></div><div class="l">Problems solved</div></div>
    <div class="stat"><div class="n">${pct}%</div><div class="l">Course complete</div></div>
    <div class="stat streak"><div class="n">${streak()}</div><div class="l">Day streak 🔥</div></div>
    <div class="stat"><div class="n">${remainingDays}</div><div class="l">Study days left</div></div>
    <div class="stat pace ${pace.status}"><div class="n">${paceLabel}</div><div class="l">${paceSub}</div></div>
    <div class="stat"><div class="n" style="font-size:17px">${Schedule.fmtFull(SCHED.projectedFinish)}</div><div class="l">Est. finish</div></div>`;
```

- [ ] **Step 2: Verify in the browser**

Open `neetcode150-plan.html`. Expected: a sixth stat tile labeled "Est. finish" showing a date like "Jun 22, 2026" (matching `SCHED.projectedFinish`). It stays visible regardless of whether the plan is on track, slipping, or finishing early.

- [ ] **Step 3: Commit**

```bash
git add neetcode150-plan.html
git commit -m "feat(plan): surface estimated finish date as a stat tile"
```

---

## Notes for the implementer

- The engine task (Task 1) carries the automated tests; the plan-page tasks (2–4) are DOM glue verified manually in the browser console because the project has no DOM test harness (it is opened as a static file, per `CLAUDE.md`).
- `index.html` (the dashboard) is intentionally **not** modified — it reads only `state.done`, which keeps its boolean shape.
- Run the engine suite at any time with `node --test tests/schedule.test.js`.

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

function fixtureDays() {
  // 2 weeks, weekday=1 problem, weekend has a push + a review. Dates are real.
  return [
    { date: "2026-06-22", week: 1, tasks: [{ id: "p1", kind: "problem", cat: "Arrays", diff: "Easy", title: "A", phase: "Foundations" }] },
    { date: "2026-06-23", week: 1, tasks: [{ id: "p2", kind: "problem", cat: "Arrays", diff: "Medium", title: "B", phase: "Foundations" }] },
    { date: "2026-06-28", week: 1, tasks: [
      { id: "p3", kind: "problem", cat: "Two Pointers", diff: "Easy", title: "C", phase: "Foundations" },
      { id: "r1", kind: "review", cat: "Review", diff: "Review", title: "Re-solve", phase: "Review" }
    ] },
    { date: "2026-06-30", week: 2, tasks: [{ id: "p4", kind: "problem", cat: "Stack", diff: "Medium", title: "D", phase: "Foundations" }] }
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

test("computeTimeline: when everything is done, future is empty and history holds it all", () => {
  const s = S.flattenStream(fixtureDays());
  const done = {}; s.forEach(it => { done[it.id] = true; });
  const r = S.computeTimeline({
    stream: s, done: done, at: {},
    todayISO: "2026-07-15", finishISO: "2026-07-31", slogans: ["go"]
  });
  assert.strictEqual(r.future.length, 0, "no remaining future days");
  assert.ok(r.history.length > 0, "completed work preserved as history");
  const ids = r.days.flatMap(d => d.tasks.map(t => t.id));
  s.forEach(it => assert.ok(ids.includes(it.id), "every task still shown: " + it.id));
});

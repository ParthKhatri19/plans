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

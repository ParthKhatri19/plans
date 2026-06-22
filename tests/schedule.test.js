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

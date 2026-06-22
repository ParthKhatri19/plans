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

  return {
    EST: EST,
    addDaysISO: addDaysISO,
    enumerateDays: enumerateDays,
    isoDow: isoDow,
    isWeekend: isWeekend,
    fmtFull: fmtFull,
    _toTime: toTime,
    flattenStream: flattenStream,
    computePace: computePace
  };
});

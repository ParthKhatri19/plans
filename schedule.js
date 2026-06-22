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

  return {
    EST: EST,
    addDaysISO: addDaysISO,
    enumerateDays: enumerateDays,
    isoDow: isoDow,
    isWeekend: isWeekend,
    fmtFull: fmtFull,
    _toTime: toTime,
    flattenStream: flattenStream,
    computePace: computePace,
    computeSchedule: computeSchedule
  };
});

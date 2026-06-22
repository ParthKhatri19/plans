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

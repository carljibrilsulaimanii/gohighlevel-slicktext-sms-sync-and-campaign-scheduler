// campaign-send-times.js
// ---------------------------------------------------------------------------
// Author:  Jibril Sulaiman
// Date:    2026-02-16 (published 2026-10-06)
// Deploy:  GoHighLevel workflow > Custom Code action (Javascript), the first action
//          in the campaign workflow (README Step 6b). Paste the whole file.
// What:    Turns one class date into nine send times for a free-class SMS sequence,
//          converted from US Eastern wall time to the UTC strings SlickText's
//          `scheduled` field expects. Later webhook steps read them as
//          {{custom_code.1.output.utc_1}} ... utc_9.
// Why:     SlickText reads `scheduled` as UTC, so an Eastern time sent raw fires four
//          or five hours early. Intl handles the DST change; GHL's runtime rejects
//          optional chaining (?.), so this is written ES5-style on purpose.
// ---------------------------------------------------------------------------
//
// Input (Property To Include In Code):
//   class_date_et   a custom value holding the class date, "YYYY-MM-DD" or
//                   "YYYY-MM-DD HH:mm:ss" (only the date part is used)
//
// Change the times in "Build schedule" to your own sequence.

function pad(n) { return String(n).padStart(2, "0"); }

function formatUtc(dateObj) {
  return dateObj.getUTCFullYear() + "-" +
    pad(dateObj.getUTCMonth() + 1) + "-" +
    pad(dateObj.getUTCDate()) + " " +
    pad(dateObj.getUTCHours()) + ":" +
    pad(dateObj.getUTCMinutes()) + ":" +
    pad(dateObj.getUTCSeconds());
}

function getPart(parts, type) {
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].type === type) return parts[i].value;
  }
  return "";
}

// Convert an ET "YYYY-MM-DD HH:mm:ss" wall time to UTC "YYYY-MM-DD HH:mm:ss"
function etWallToUtcString(etStr) {
  var tz = "America/New_York";
  var split = etStr.trim().split(" ");
  if (split.length < 2) throw new Error('Invalid ET datetime. Use "YYYY-MM-DD HH:mm:ss"');

  var dSplit = split[0].split("-");
  var tSplit = split[1].split(":");
  var y = Number(dSplit[0]);
  var m = Number(dSplit[1]);
  var d = Number(dSplit[2]);
  var hh = Number(tSplit[0]);
  var mm = Number(tSplit[1]);
  var ss = Number(tSplit[2]);

  // Treat the wall time as UTC first, then measure how that instant renders in ET
  var naive = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));

  var parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(naive);

  var displayedAsUTC = Date.UTC(
    Number(getPart(parts, "year")),
    Number(getPart(parts, "month")) - 1,
    Number(getPart(parts, "day")),
    Number(getPart(parts, "hour")),
    Number(getPart(parts, "minute")),
    Number(getPart(parts, "second"))
  );
  var intendedAsUTC = Date.UTC(y, m - 1, d, hh, mm, ss);

  // The difference is the ET offset at that moment (DST-aware)
  var offsetMs = intendedAsUTC - displayedAsUTC;
  return formatUtc(new Date(naive.getTime() + offsetMs));
}

function parseClassDateOnly(input) {
  // Accept "YYYY-MM-DD" or "YYYY-MM-DD HH:mm:ss"
  var s = (input || "").trim();
  if (!s) throw new Error("Missing inputData.class_date_et");
  return s.substring(0, 10);
}

function addDays(dateStrYYYYMMDD, deltaDays) {
  var y = Number(dateStrYYYYMMDD.substring(0, 4));
  var m = Number(dateStrYYYYMMDD.substring(5, 7));
  var d = Number(dateStrYYYYMMDD.substring(8, 10));
  var dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); // noon UTC avoids DST edge weirdness
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.getUTCFullYear() + "-" + pad(dt.getUTCMonth() + 1) + "-" + pad(dt.getUTCDate());
}

function makeEt(dateYYYYMMDD, timeHHMMSS) {
  return dateYYYYMMDD + " " + timeHHMMSS;
}

// ===== Build schedule =====
var classDate = parseClassDateOnly(inputData.class_date_et);

var d_minus1 = addDays(classDate, -1);
var d0 = classDate;
var d_plus1 = addDays(classDate, 1);
var d_plus2 = addDays(classDate, 2);

var et1 = makeEt(d_minus1, "10:00:00"); // day before, 10am
var et2 = makeEt(d0, "10:00:00");       // class day, 10am
var et3 = makeEt(d0, "16:00:00");       // class day, 4pm
var et4 = makeEt(d0, "18:45:00");       // class day, 6:45pm
var et5 = makeEt(d0, "20:30:00");       // class day, 8:30pm
var et6 = makeEt(d_plus1, "10:00:00");  // next day, 10am
var et7 = makeEt(d_plus1, "10:00:00");  // next day, 10am
var et8 = makeEt(d_plus1, "18:50:00");  // next day, 6:50pm
var et9 = makeEt(d_plus2, "10:00:00");  // two days later, 10am

output = {
  class_date_et: classDate,

  // ET strings, handy for debugging
  et_1: et1, et_2: et2, et_3: et3, et_4: et4, et_5: et5,
  et_6: et6, et_7: et7, et_8: et8, et_9: et9,

  // UTC strings for the SlickText `scheduled` field
  utc_1: etWallToUtcString(et1),
  utc_2: etWallToUtcString(et2),
  utc_3: etWallToUtcString(et3),
  utc_4: etWallToUtcString(et4),
  utc_5: etWallToUtcString(et5),
  utc_6: etWallToUtcString(et6),
  utc_7: etWallToUtcString(et7),
  utc_8: etWallToUtcString(et8),
  utc_9: etWallToUtcString(et9)
};

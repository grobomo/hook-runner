// WORKFLOW: shtd
// WHY: Claude reads test reports and PDFs, sees mostly-green results, and immediately
// commits without enumerating every FAIL/WARN/timeout. Hours wasted in E2E cycles
// when bugs shipped because the report "looked fine" at a glance.
"use strict";

var REPORT_PATTERNS = [
  /\.report/i,
  /report\./i,
  /results?\./i,
  /test[-_]?results?/i,
  /coverage/i,
  /\.pdf$/i,
  /summary/i,
  /health[-_]?check/i
];

module.exports = function(input) {
  if (input.tool_name !== "Read") return null;

  var filePath = "";
  try {
    filePath = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).file_path || "";
  } catch(e) { filePath = (input.tool_input || {}).file_path || ""; }

  if (!filePath) return null;

  // Check if the file looks like a report
  var basename = filePath.replace(/\\/g, "/").split("/").pop() || "";
  var isReport = false;
  for (var i = 0; i < REPORT_PATTERNS.length; i++) {
    if (REPORT_PATTERNS[i].test(basename)) { isReport = true; break; }
  }

  // Also check directory name
  if (!isReport) {
    var dirPart = filePath.replace(/\\/g, "/");
    if (/\/reports?\//i.test(dirPart) || /\/results?\//i.test(dirPart)) {
      isReport = true;
    }
  }

  if (!isReport) return null;

  // Non-blocking advisory — inject checklist every time
  return {
    decision: "block",
    reason: "REPORT FILE READ — Review checklist before acting on results.\n\n" +
      "File: " + basename + "\n\n" +
      "Before committing or declaring results:\n" +
      "  1. List EVERY FAIL, WARN, timeout, error, and empty section in this report\n" +
      "  2. For each: is it a real bug, expected behavior, or needs investigation?\n" +
      "  3. File a TODO for each unresolved issue\n" +
      "  4. Check what's MISSING from the report that should be there\n" +
      "  5. Only then commit or declare results\n\n" +
      "Do NOT skim and assume green. Enumerate every issue explicitly."
  };
};

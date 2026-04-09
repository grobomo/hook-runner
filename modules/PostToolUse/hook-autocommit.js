// WORKFLOW: shtd
// WHY: Hook module edits were lost because they were never committed to the hook-runner repo.
// Auto-commit hook module changes to the run-modules git repo.
// Every Write/Edit to a hook module file gets committed automatically.
var fs = require("fs");
var path = require("path");
var child_process = require("child_process");

var MODULES_DIR = path.join(
  (process.env.HOME || process.env.USERPROFILE || "").replace(/\\/g, "/"),
  ".claude/hooks/run-modules"
);

module.exports = function(input) {
  var toolName = input.tool_name || "";
  if (toolName !== "Write" && toolName !== "Edit") return null;

  var filePath = ((input.tool_input || {}).file_path || "").replace(/\\/g, "/");
  if (filePath.indexOf("/run-modules/") < 0) return null;

  // Auto-commit the change
  try {
    var fileName = filePath.split("/run-modules/")[1] || path.basename(filePath);
    child_process.execSync(
      'git add -A && git commit -m "auto: update ' + fileName.replace(/"/g, '\\"') + '"',
      { cwd: MODULES_DIR, stdio: "ignore", timeout: 5000, windowsHide: true }
    );
  } catch (e) {
    // No changes or git error — silent
  }

  return null;
};

// TOOLS: Edit, Write
// WORKFLOW: shtd, starter
// WHY: Config changes happened without stated rationale, causing confusion later.
// Settings change gate: injects a reminder when modifying ~/.claude/ config files.
// Doesn't block — just ensures Claude states the reason in its response.
var WATCHED = ["/settings.json", "/settings.local.json", "/hooks/run-modules/", "/hooks/run-"];

module.exports = function(input) {
  var toolName = input.tool_name || "";
  if (toolName !== "Write" && toolName !== "Edit") return null;

  var filePath = ((input.tool_input || {}).file_path || "").replace(/\\/g, "/");
  var isSettings = false;
  for (var i = 0; i < WATCHED.length; i++) {
    if (filePath.indexOf(WATCHED[i]) >= 0) { isSettings = true; break; }
  }
  if (!isSettings) return null;

  // Non-blocking reminder — logged by settings-audit-log PostToolUse module
  return null;
};

// WHY: Dead code references and stale docs accumulate silently. When Claude
// edits code that removes or renames something, the docs and rules that
// reference the old thing become misleading for future sessions.
"use strict";

module.exports = function(input) {
  if (input.tool_name !== "Edit" && input.tool_name !== "Write") return null;
  var filePath = (input.tool_input || {}).file_path || "";
  // Only check code files, not docs themselves
  if (/\.(md|txt|json)$/i.test(filePath)) return null;

  return {
    outputToModel: "Reminder: if you just removed/renamed code, update any " +
      "CLAUDE.md, TODO.md, rules, or comments that reference the old names."
  };
};

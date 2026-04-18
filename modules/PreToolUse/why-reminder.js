// TOOLS: Edit, Write
// WORKFLOW: shtd, gsd
// WHY: Comments that describe WHAT code does are useless — Claude can read code.
// Comments that explain WHY decisions were made are invaluable — they survive context
// resets, guide fleet workers, and prevent future sessions from repeating mistakes.
// This non-blocking reminder fires before every Write/Edit to code/config/docs,
// nudging Claude to include WHY reasoning in comments, docs, and commit messages.
"use strict";

var CODE_EXTENSIONS = /\.(js|ts|py|sh|bash|yml|yaml|json|md|txt|html|css|toml|cfg|ini|env|xml)$/i;
var SKIP_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|ico|woff|ttf|eot|pdf|zip|tar|gz|bin|exe|dll|so|dylib|lock)$/i;

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Write" && tool !== "Edit") return null;

  var parsed;
  try { parsed = typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}; } catch(e) { return null; }

  var filePath = parsed.file_path || "";
  if (!filePath) return null;

  // Skip binary/non-text files
  if (SKIP_EXTENSIONS.test(filePath)) return null;

  // Only remind for code/config/docs files
  if (!CODE_EXTENSIONS.test(filePath)) return null;

  return {
    text: "WHY-FIRST REMINDER: Every comment, docstring, and config description should explain WHY — the intent, the incident, the decision — not WHAT the code does. Code is self-documenting for WHAT. Comments survive context resets and guide future sessions. Ask: would a new Claude session understand the reasoning from this comment alone?"
  };
};

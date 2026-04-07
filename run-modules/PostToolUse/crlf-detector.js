// WORKFLOW: shtd
// WHY: On Windows, Write/Edit can produce CRLF line endings that break shell scripts,
// YAML files, SSH keys, and other Unix-sensitive formats. The crlf-ssh-key-check
// module only covers SSH keys — this catches CRLF in all sensitive file types.
"use strict";
var fs = require("fs");
var path = require("path");

// File extensions where CRLF causes real breakage
var SENSITIVE_EXTENSIONS = [".sh", ".bash", ".yml", ".yaml", ".py", ".rb", ".pl", ".env", ".conf", ".cfg"];

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Write" && tool !== "Edit") return null;

  var filePath = "";
  try { filePath = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).file_path || ""; } catch (e) { filePath = (input.tool_input || {}).file_path || ""; }
  if (!filePath) return null;

  var ext = path.extname(filePath).toLowerCase();
  var isSensitive = false;
  for (var i = 0; i < SENSITIVE_EXTENSIONS.length; i++) {
    if (ext === SENSITIVE_EXTENSIONS[i]) { isSensitive = true; break; }
  }
  if (!isSensitive) return null;

  // Check for CRLF in the file
  var content;
  try { content = fs.readFileSync(filePath, "utf-8"); } catch (e) { return null; }
  if (content.indexOf("\r\n") === -1) return null;

  var crlfCount = 0;
  for (var ci = 0; ci < content.length - 1; ci++) {
    if (content.charAt(ci) === "\r" && content.charAt(ci + 1) === "\n") crlfCount++;
  }

  return {
    decision: "block",
    reason: "WARNING: " + path.basename(filePath) + " has " + crlfCount + " CRLF line endings. Shell scripts, YAML, and Python files break with \\r\\n on Unix. Fix with: sed -i 's/\\r$//' " + filePath
  };
};

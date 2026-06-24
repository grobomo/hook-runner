// TOOLS: Edit, Write, Bash
// WORKFLOW: shtd, starter, haiku-rules
// WHY: Hardcoded C:\Users paths in scripts broke portability across machines.
// T732: Extended to cover Bash file mutations (echo >, cat heredoc, tee, printf >).
// BLOCK Write/Edit/Bash with hardcoded absolute user paths in file content.
// Catches Windows, Linux, and macOS home directory paths in new_string/content.
// Absolute paths break portability — use variables or relative paths.
"use strict";

var path = require("path");
var bashHelper = require(path.join(__dirname, "_bash-write-patterns.js"));

// Patterns for hardcoded absolute paths in content
var winPath = /[A-Z]:[\\\/]Users[\\\/]\w+[\\\/]/i;  // Windows home dirs
var linuxPath = /\/home\/\w+\//;                      // Linux home dirs
var macPath = /\/Users\/\w+\//;                       // macOS home dirs

// Check text content for hardcoded paths. Returns block result or null.
function checkContent(text, filePath, toolLabel) {
  if (!text) return null;

  // Allow common false positives by file extension
  var ext = filePath.split(".").pop().toLowerCase();
  if (ext === "md" || ext === "txt" || ext === "html") return null;
  // CloudFormation/Docker templates legitimately reference /home/ubuntu on EC2
  if (/cloudformation[\\\/]/i.test(filePath) && (ext === "yaml" || ext === "yml")) return null;
  if (/Dockerfile/i.test(filePath.split(/[\\\/]/).pop())) return null;
  // Test files contain path fixtures as test data — not real hardcoded paths
  if (/[\\\/]test[s]?[\\\/]/i.test(filePath) || /^test-/i.test(filePath.split(/[\\\/]/).pop())) return null;

  // Check each line — skip comment lines
  var lines = text.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    // Skip comments
    if (/^(\/\/|#|\/\*|\*|<!--)/.test(line)) continue;
    // Skip string literals that look like path examples
    if (/["'].*example.*["']/i.test(line)) continue;

    var match = null;
    if (winPath.test(line)) match = line.match(winPath);
    else if (linuxPath.test(line)) match = line.match(linuxPath);
    else if (macPath.test(line)) match = line.match(macPath);

    if (match) {
      return {
        decision: "block",
        reason: "BLOCKED: Hardcoded path detected in script\nWHY: Hardcoded C:\\Users paths broke script portability when run on different machines or user accounts\nNEXT STEPS:\n1. Replace hardcoded paths with environment variables like %USERPROFILE% or %APPDATA%\n2. Use relative paths or path resolution functions appropriate to your language\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix no-hardcoded-paths — {describe the issue}\""
      };
    }
  }
  return null;
}

module.exports = function(input) {
  var tool = input.tool_name;
  var ti = input.tool_input || {};

  // T732: Bash file mutations — extract target path + content, apply same checks
  if (tool === "Bash") {
    var cmd = ti.command || "";
    if (!cmd) return null;
    var parsed = bashHelper.parseBashWrite(cmd);
    if (!parsed || !parsed.content) return null;
    return checkContent(parsed.content, parsed.targetPath || "", "Bash");
  }

  if (tool !== "Write" && tool !== "Edit") return null;

  // Check the content being written/edited (not the file_path — that's fine)
  var text = "";
  if (tool === "Write") text = ti.content || "";
  if (tool === "Edit") text = ti.new_string || "";

  return checkContent(text, ti.file_path || "", tool);
};

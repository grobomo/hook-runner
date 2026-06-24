// TOOLS: Edit
// WORKFLOW: shtd, starter
// WHY: T758b was marked [x] done in TODO.md but the fix was never applied to
// the live file. The session claimed "updated todo-awareness rule" but the rule
// still had the old text. This gate detects when a TODO is marked done and
// warns if the claimed change can't be verified in the target file.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ VERIFY TODO COMPLETION GATE — Trust but verify                         │
// │                                                                        │
// │ When Claude marks a TODO as done (- [ ] → - [x]), extract the          │
// │ claimed change from the description and verify it exists.              │
// │ Non-blocking (PostToolUse) — emits warning via stderr.                 │
// │                                                                        │
// │ INCIDENT HISTORY:                                                      │
// │   2026-06-01: T758b "Fix todo-awareness rule" was marked done but      │
// │   the rule in stop-haiku-rules.yaml still had the old restrictive      │
// │   text. User hit the same wrong behavior again weeks later. T782.      │
// └─────────────────────────────────────────────────────────────────────────┘
"use strict";

var fs = require("fs");
var path = require("path");

var LOG_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || "",
  ".claude", "hooks", "hook-log.jsonl"
);

function _log(action, detail) {
  try {
    var entry = JSON.stringify({
      ts: new Date().toISOString(),
      module: "verify-todo-completion-gate",
      action: action,
      detail: (detail || "").substring(0, 300)
    }) + "\n";
    fs.appendFileSync(LOG_PATH, entry);
  } catch (e) { /* best effort */ }
}

// Extract file references from a TODO completion description
function extractFileRefs(text) {
  var refs = [];
  // Normalize backslashes for matching
  var normText = text.replace(/\\/g, "/");
  // Match full paths (with drive letter or absolute) first
  var fullPathPattern = /(?:[A-Z]:\/|\/)[^\s,;)]+\.(ya?ml|js|json|md|txt|sh|py|ts)\b/gi;
  var match;
  while ((match = fullPathPattern.exec(normText)) !== null) {
    var f = match[0];
    if (refs.indexOf(f) === -1) refs.push(f);
  }
  // Then match bare filenames (e.g., stop-haiku-rules.yaml)
  var filePattern = /[\w./-]+\.(ya?ml|js|json|md|txt|sh|py|ts)\b/gi;
  while ((match = filePattern.exec(normText)) !== null) {
    var f2 = match[0];
    if (f2 === "TODO.md" || f2 === "CLAUDE.md" || f2 === "README.md") continue;
    if (f2 === "package.json" || f2 === ".gitignore") continue;
    // Skip if already covered by a full path
    var alreadyCovered = false;
    for (var r = 0; r < refs.length; r++) {
      if (refs[r].indexOf(f2) !== -1) { alreadyCovered = true; break; }
    }
    if (!alreadyCovered && refs.indexOf(f2) === -1) refs.push(f2);
  }
  return refs;
}

// Extract key phrases that should exist in the target file
function extractExpectedContent(text) {
  var phrases = [];
  var btPattern = /`([^`]{5,80})`/g;
  var match;
  while ((match = btPattern.exec(text)) !== null) {
    phrases.push(match[1]);
  }
  var quotePattern = /"([^"]{5,80})"/g;
  while ((match = quotePattern.exec(text)) !== null) {
    var q = match[1];
    if (/\b(the|and|but|for|was|are|has|had)\b/i.test(q) && q.split(" ").length > 5) continue;
    phrases.push(q);
  }
  return phrases;
}

module.exports = function(input) {
  if (input.tool_name !== "Edit") return null;

  var ti = input.tool_input || {};
  var filePath = (ti.file_path || "").replace(/\\/g, "/");
  if (!filePath) return null;

  if (path.basename(filePath) !== "TODO.md") return null;

  var oldStr = ti.old_string || "";
  var newStr = ti.new_string || "";

  // Detect marking a TODO as done: old has "- [ ]", new has "- [x]"
  if (!/- \[ \]/.test(oldStr) || !/- \[x\]/.test(newStr)) return null;

  var descMatch = newStr.match(/- \[x\] [^:]+:\s*\*\*[^*]+\*\*\s*—\s*(.*)/s);
  if (!descMatch) return null;
  var description = descMatch[1];

  var fileRefs = extractFileRefs(description);
  var expectedContent = extractExpectedContent(description);

  if (fileRefs.length === 0 && expectedContent.length === 0) return null;

  var warnings = [];
  var HOME = process.env.HOME || process.env.USERPROFILE || "";

  for (var i = 0; i < fileRefs.length; i++) {
    var ref = fileRefs[i];
    // If ref is already an absolute path, try it directly
    var basename = path.basename(ref);
    var candidates = [
      ref,                                  // full path or relative
      ref.replace(/\//g, path.sep),         // with native separators
      path.join(process.cwd(), basename),
      path.join(HOME, ".claude", "proxy", basename),
      path.join(HOME, ".claude", "hooks", basename),
      path.join(HOME, ".claude", "hooks", "run-modules", "PreToolUse", basename),
      path.join(HOME, ".claude", "hooks", "run-modules", "PostToolUse", basename),
      path.join(HOME, ".claude", "hooks", "run-modules", "Stop", basename),
      path.join(HOME, ".claude", "hooks", "run-modules", "SessionStart", basename),
    ];

    var found = false;
    var fileContent = "";
    for (var c = 0; c < candidates.length; c++) {
      try {
        fileContent = fs.readFileSync(candidates[c], "utf-8");
        found = true;
        break;
      } catch (e) { /* try next */ }
    }

    if (!found) {
      warnings.push("Referenced file '" + ref + "' not found in expected locations");
      continue;
    }

    for (var j = 0; j < expectedContent.length; j++) {
      if (fileContent.indexOf(expectedContent[j]) === -1) {
        warnings.push("Expected content '" + expectedContent[j].substring(0, 60) + "' not found in " + ref);
      }
    }
  }

  if (warnings.length > 0) {
    var msg = "VERIFY-TODO-COMPLETION WARNING: TODO marked done but claims could not be verified:\n" +
      warnings.map(function(w) { return "  - " + w; }).join("\n") + "\n" +
      "Check that the claimed changes were actually applied to the live files.";
    _log("warn", warnings.join("; "));
    process.stderr.write(msg + "\n");
  } else if (fileRefs.length > 0) {
    _log("pass", "Verified " + fileRefs.length + " file refs");
  }

  return null;
};

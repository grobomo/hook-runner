// TOOLS: Edit, Write
// WORKFLOW: shtd, starter
// WHY: User directive — "check if the name is intuitive based on current
// function of the file, and rename if needed." Filenames are part of the
// memory system — better names mean better recall across sessions.
// Example: no-rules-gate.js expanded to block native memory, rules files,
// AND MEMORY.md writes, but the name only mentioned "rules."
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ FILE NAMING CHECK — Does the filename still match the code?            │
// │                                                                        │
// │ After Edit/Write, reads the file content and asks Haiku whether the   │
// │ filename accurately describes what the code does. If mismatch found,  │
// │ emits a warning via stderr. Non-blocking, advisory only.              │
// │                                                                        │
// │ INCIDENT HISTORY:                                                      │
// │   2026-05-30: no-rules-gate.js expanded to block .claude/rules/,      │
// │   MEMORY.md, and native memory writes. Name said "rules" but it       │
// │   blocked 3 different things. Renamed to no-native-memory-gate.js.    │
// └─────────────────────────────────────────────────────────────────────────┘
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var LOG_PATH = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");
var SESSION = (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8);

// Track files already checked this session to avoid spamming
var checkedFiles = {};

function _log(action, detail) {
  try {
    var entry = JSON.stringify({
      ts: new Date().toISOString(),
      module: "file-naming-check",
      event: "PostToolUse",
      session: SESSION,
      action: action,
      detail: (detail || "").substring(0, 300)
    }) + "\n";
    fs.appendFileSync(LOG_PATH, entry);
  } catch (e) { /* best effort */ }
}

// Extensions worth checking for naming clarity
var SOURCE_EXTS = {
  ".js": true, ".ts": true, ".jsx": true, ".tsx": true,
  ".py": true, ".rb": true, ".go": true, ".rs": true,
  ".sh": true, ".bash": true, ".ps1": true,
  ".yml": true, ".yaml": true
};

// Directories to skip entirely
var SKIP_DIRS = [
  "node_modules", ".git", "dist", "build", "__pycache__",
  ".next", "coverage", "vendor", ".cache"
];

function shouldCheck(filePath) {
  if (!filePath) return false;
  var norm = filePath.replace(/\\/g, "/");

  // Skip non-source files
  var ext = path.extname(norm).toLowerCase();
  if (!SOURCE_EXTS[ext]) return false;

  // Skip files in excluded directories
  for (var i = 0; i < SKIP_DIRS.length; i++) {
    if (norm.indexOf("/" + SKIP_DIRS[i] + "/") !== -1) return false;
  }

  // Skip files starting with _ (private/internal convention)
  var base = path.basename(norm);
  if (base.startsWith("_")) return false;

  // Skip test files (naming convention is different)
  if (base.startsWith("test-") || base.startsWith("test_")) return false;

  // Skip very small filenames (index.js, app.js — too generic to judge)
  var nameWithoutExt = path.basename(norm, ext);
  if (nameWithoutExt.length < 5) return false;

  // Only check each file once per session
  if (checkedFiles[norm]) return false;
  checkedFiles[norm] = true;

  return true;
}

module.exports = function(input) {
  if (process.env.HOOK_RUNNER_TEST === "1") return null;
  if (!input) return null;

  var toolName = input.tool_name || "";
  if (toolName !== "Edit" && toolName !== "Write") return null;

  var toolInput = input.tool_input || {};
  var filePath = toolInput.file_path || toolInput.path || "";

  if (!shouldCheck(filePath)) return null;

  // Read the file content
  var content;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch (e) {
    return null; // File gone or unreadable
  }

  // Skip very small files (not enough content to judge)
  if (content.length < 100) return null;

  // Skip very large files (too expensive for L1)
  if (content.length > 15000) return null;

  // Load haiku client
  var haiku;
  try {
    haiku = require(path.join(HOME, ".claude", "hooks", "haiku-client"));
  } catch (e) {
    _log("skip", "haiku-client not available: " + e.message);
    return null;
  }

  var basename = path.basename(filePath);
  var nameWithoutExt = path.basename(filePath, path.extname(filePath));

  // Ask Haiku if the filename matches the code
  var prompt = [
    "You are a code naming reviewer. Given a filename and its content, determine if the filename accurately describes what the code does.",
    "",
    "Filename: " + basename,
    "Name parts: " + nameWithoutExt.replace(/[-_]/g, " "),
    "",
    "File content (first 3000 chars):",
    content.slice(0, 3000),
    "",
    "Does the filename accurately describe the file's primary purpose?",
    "A good name captures the MAIN thing the code does, not every detail.",
    "",
    "Reply with JSON only:",
    '{"match": true/false, "current_purpose": "one-sentence description of what the code actually does", "suggested_name": "better-name.ext or null if current name is fine", "confidence": "high/medium/low"}'
  ].join("\n");

  var result = haiku.call({
    prompt: prompt,
    caller: "file-naming-check",
    jsonMode: true,
    maxTokens: 200,
    timeoutMs: 8000
  });

  if (!result.ok || !result.parsed) {
    _log("haiku_fail", result.error || "no parsed result");
    return null;
  }

  var p = result.parsed;
  _log("checked", basename + " → match=" + p.match + " conf=" + p.confidence +
    (p.suggested_name ? " suggest=" + p.suggested_name : ""));

  // Only warn on high-confidence mismatches
  if (p.match === false && p.confidence === "high" && p.suggested_name) {
    process.stderr.write(
      "\n[file-naming-check] Filename may not match purpose:" +
      "\n  Current: " + basename +
      "\n  Purpose: " + (p.current_purpose || "unknown") +
      "\n  Suggest: " + p.suggested_name +
      "\n  Consider renaming if the suggestion is better.\n"
    );
  }

  return null; // Non-blocking — always pass
};

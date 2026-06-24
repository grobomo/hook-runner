// TOOLS: Edit, Write
// WORKFLOW: shtd
// WHY: Claude builds entire systems without documenting WHY they exist. Future sessions
// inherit code but not intent, leading to contradictory designs, redundant tools, and
// wasted effort. Vision docs capture architectural intent so the design survives context
// resets. Spec gates enforce WHAT to build; vision gates enforce WHY it exists.
//
// T793: Enforces docs/<component>/vision.md exists BEFORE building new components.
// Uses _shtd-enforce.js helper — dormant when shtd workflow disabled.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ VISION-DOC-GATE — Enforce architectural intent documentation           │
// │                                                                        │
// │ INCIDENT HISTORY:                                                      │
// │   2026-06-01: Claude built 3 competing health-check systems in one     │
// │   session because no vision doc recorded WHY the first one existed     │
// │   or what its boundaries were. Each session reinvented from scratch.   │
// │   2026-05-28: request-tracker redesigned twice in 48 hours because     │
// │   the architectural intent was only in CLAUDE.md prose, not in a       │
// │   discoverable vision doc. Second session contradicted the first.      │
// └─────────────────────────────────────────────────────────────────────────┘
"use strict";
var fs = require("fs");
var path = require("path");

var shtd = require("./_shtd-enforce");

var LOG_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || "",
  ".claude", "hooks", "hook-log.jsonl"
);

function _log(action, detail) {
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify({
      ts: new Date().toISOString(),
      module: "vision-doc-gate",
      action: action,
      detail: (detail || "").substring(0, 300)
    }) + "\n");
  } catch (e) { /* best effort */ }
}

// Files/dirs that are exempt from vision doc requirement
var EXEMPT_PATTERNS = [
  /[/\\]test[s]?[/\\]/i,              // test files
  /[/\\]scripts[/\\]test[/\\]/i,       // test scripts
  /\.test\.(js|ts|py|sh)$/i,          // test files by extension
  /[/\\]docs[/\\]/i,                   // docs themselves
  /[/\\]specs[/\\]/i,                  // specs themselves
  /[/\\]\.(git|claude|coconut)[/\\]/i, // meta dirs
  /TODO\.md$/i,                        // project tracking
  /CLAUDE\.md$/i,                      // project instructions
  /README\.md$/i,                      // project readme
  /CHANGELOG\.md$/i,                   // changelog
  /package\.json$/i,                   // package config
  /\.ya?ml$/i,                         // config/workflow files
  /\.json$/i,                          // config files
  /\.gitignore$/i,                     // git config
  /\.env/i,                            // env files
  /[/\\]workflows[/\\]/i,             // workflow definitions
  /[/\\]rules[/\\]/i,                 // rule files
  /[/\\]node_modules[/\\]/i           // dependencies
];

// Map a file path to its component name
// e.g., "modules/PreToolUse/spec-gate.js" → "modules"
//        "src/workflow.js" → "src"
//        "cli/setup.js" → "cli"
function getComponent(filePath) {
  var projectDir = (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, "/");
  var rel = filePath.replace(/\\/g, "/");
  if (rel.indexOf(projectDir) === 0) {
    rel = rel.substring(projectDir.length).replace(/^\//, "");
  }

  // Component is the first meaningful directory
  var relParts = rel.split("/");
  if (relParts.length >= 2) {
    return relParts[0];
  }

  // Top-level file — component is the project root
  return null;
}

// Check if docs/<component>/vision.md exists in any docs structure
function hasVisionDoc(projectDir, component) {
  if (!component) return true; // top-level files don't need vision docs

  var candidates = [
    path.join(projectDir, "docs", component, "vision.md"),
    path.join(projectDir, "docs", "vision", component + ".md"),
    path.join(projectDir, "docs", component, "VISION.md")
  ];

  for (var i = 0; i < candidates.length; i++) {
    try {
      fs.accessSync(candidates[i], fs.constants.F_OK);
      return true;
    } catch (e) { /* not found */ }
  }

  return false;
}

function isExempt(filePath) {
  for (var i = 0; i < EXEMPT_PATTERNS.length; i++) {
    if (EXEMPT_PATTERNS[i].test(filePath)) return true;
  }
  return false;
}

module.exports = function(input) {
  // Only gate on Edit/Write
  if (input.tool_name !== "Edit" && input.tool_name !== "Write") return null;

  var filePath = (input.tool_input || {}).file_path || "";
  filePath = filePath.replace(/\\/g, "/");

  if (!filePath) return null;

  // Check if shtd workflow is enabled — dormant otherwise
  if (!shtd.isShtdEnabled()) return null;

  // Exempt files don't need vision docs
  if (isExempt(filePath)) return null;

  var projectDir = (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, "/");

  // Only enforce for files within the current project
  if (filePath.indexOf(projectDir) !== 0) return null;

  // Check if docs/ directory exists at all — auto-activate like spec-gate
  var docsDir = path.join(projectDir, "docs");
  if (!fs.existsSync(docsDir)) {
    // No docs/ dir — vision gate dormant for this project
    return null;
  }

  var component = getComponent(filePath);
  if (!component) return null;

  if (hasVisionDoc(projectDir, component)) {
    return null; // vision doc exists, proceed
  }

  _log("block", "no vision doc for component: " + component);

  return {
    decision: "block",
    reason: [
      "BLOCKED: New component without vision doc",
      "WHY: Building systems without documenting WHY they exist leads to tools that solve",
      "the wrong problem. Vision docs capture the intent so future sessions understand",
      "the design, not just the code.",
      "NEXT STEPS:",
      "1. Create docs/" + component + "/vision.md with:",
      "   - The Problem: what's broken or missing",
      "   - The Vision: what it should look like",
      "   - How It Works: architecture/data flow",
      "   - Decision Framework: what it does vs delegates (if applicable)",
      "2. THEN write the spec for the specific task",
      "3. THEN implement",
      'FALSE POSITIVE? File a TODO in hook-runner: "Fix vision-doc-gate — {describe the issue}"'
    ].join("\n")
  };
};

// TOOLS: Edit, Write, Bash
// WORKFLOW: haiku-rules
// WHY: Gates were created with vague names, no comments, overlapping responsibilities,
//       and no incident history — making the hook system unmaintainable.
//       T629: Python script wrote broken code via Bash (path.write_text) — gate missed it.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ GATE QUALITY GATE — Enforces standards when creating/editing gates      │
// │                                                                         │
// │ Fires when: Edit, Write, or Bash targets a file in hooks/run-modules/   │
// │                                                                         │
// │ Checks:                                                                 │
// │   1. EXISTING GATES READ — before writing a new gate, you must have     │
// │      read at least one other gate file in the same session (ensures     │
// │      awareness of what already exists, prevents duplication)             │
// │                                                                         │
// │   2. NAME MATCHES PURPOSE — gate filename must end in -gate.js and      │
// │      the name should describe exactly what it blocks (single            │
// │      responsibility: "settings-watchdog-gate" not "misc-safety-gate")   │
// │                                                                         │
// │   3. DOCUMENTATION REQUIRED — every gate must have:                     │
// │      - // WHY: line explaining the real incident that caused it         │
// │      - An ASCII box or block comment with:                              │
// │        • What the gate does (one sentence)                              │
// │        • INCIDENT HISTORY section with dates + what broke               │
// │      - // TOOLS: line declaring which tools it intercepts               │
// │      - Logging ALL activity to ~/.claude/hooks/hook-log.jsonl           │
// │        (every invocation, pass or block, with context about what it did)│
// │                                                                         │
// │   4. SINGLE RESPONSIBILITY — if the content handles multiple unrelated  │
// │      concerns, suggest splitting into separate gates                    │
// │                                                                         │
// │ INCIDENT HISTORY:                                                       │
// │   2026-05-08: spec-gate combined spec enforcement + TODO.md fallback    │
// │   in one file with confusing "OR" logic. Users couldn't tell what       │
// │   satisfied the gate. Split into spec-gate + todo-gate.                 │
// │                                                                         │
// │   2026-05-08: settings-watchdog-gate was created without incident       │
// │   history initially. Only after the second breakage was the full        │
// │   documentation added. Gates should be born documented.                 │
// │                                                                         │
// │   2026-05-10: Python script wrote broken code via Bash (path.write_text)│
// │   gate only checked Edit/Write tools, missed Bash file operations.      │
// │   Added Bash detection (T629).                                          │
// └─────────────────────────────────────────────────────────────────────────┘
"use strict";

var fs = require("fs");
var path = require("path");

var HOOKS_DIR = path.join(process.env.HOME || "", ".claude", "hooks", "run-modules");

module.exports = function(input) {
  var tool = input.tool_name;

  // ─── Bash detection (T629) ──────────────────────────────────────────
  if (tool === "Bash") {
    var cmd = ((input.tool_input || {}).command || "");
    var hitsHookDir = cmd.indexOf("hooks/run-modules/") >= 0 ||
                      cmd.indexOf(".claude/hooks/run-modules/") >= 0;
    if (!hitsHookDir) return null;

    if (!cmd.match(/\.js\b/)) return null;

    // Allow .pending → .js renames (verification workflow activation)
    if (/\bmv\s.*\.js\.pending\s.*\.js\b/.test(cmd)) return null;

    // T779+T822: Allow mv/cp from hook-runner project (the only project that can edit hooks)
    var projDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/").toLowerCase();
    var cwd = process.cwd().replace(/\\/g, "/").toLowerCase();
    var isHR = projDir.indexOf("/hook-runner") !== -1 || cwd.indexOf("/hook-runner") !== -1;
    if (isHR && /\b(mv|cp)\s/.test(cmd)) return null;

    var writePatterns = [
      // T823: Exclude redirects to /dev/null (not a real write target)
      /(?<![2&])>\s*(?!\/dev\/null\b)[^\s&]/,
      /\btee\s/,
      /\bsed\s+-i/,
      /\bcp\s/,
      /\bmv\s/,
      /write_text/,
      /open\(/,
      /json\.dump/,
      /cat\s*<</,
      /\bpython[3]?\s.*-c/,
    ];
    var isWrite = writePatterns.some(function(p) { return p.test(cmd); });
    if (!isWrite) return null;

    return {
      decision: "block",
      reason: [
        "BLOCKED: Bash write to hook module directory.",
        "WHY: Bash writes bypass all gate quality validation (// WHY:, // TOOLS:, logging, naming conventions).",
        "NEXT STEPS:",
        "1. Use Edit or Write tools instead — they trigger quality checks automatically",
        "2. If you need Bash for a bulk rename, write a .js.pending file first for verification",
        "Command: " + cmd.slice(0, 120),
        "FALSE POSITIVE? File a TODO in hook-runner: \"Fix gate-quality-gate — {describe the issue}\"",
      ].join("\n"),
    };
  }

  if (tool !== "Edit" && tool !== "Write") return null;

  var filePath = ((input.tool_input || {}).file_path || "").replace(/\\/g, "/");
  if (!filePath) return null;

  // Only fire for files in the hooks/run-modules directories
  if (filePath.indexOf("/hooks/run-modules/") === -1 &&
      filePath.indexOf("/hook-runner/modules/") === -1) return null;

  // Only fire for .js gate files
  if (!filePath.endsWith(".js")) return null;
  var basename = path.basename(filePath);

  // --- Check 1: Name convention (new files only) ---
  // Existing modules may predate the convention — only enforce on creation
  var isHelper = basename.startsWith("_");
  var isNewFile = tool === "Write" && !fs.existsSync(filePath);
  if (isNewFile && !isHelper && !basename.endsWith("-gate.js") && !basename.endsWith("-check.js") && !basename.endsWith("-guard.js")) {
    return {
      decision: "block",
      reason: [
        "BLOCKED: Filename '" + basename + "' doesn't follow naming convention.",
        "WHY: Non-standard names make gates undiscoverable and confuse the module loader.",
        "NEXT STEPS:",
        "1. Rename to end in -gate.js, -guard.js, or -check.js (e.g., my-feature-gate.js)",
        "2. For shared utilities, prefix with _ (e.g., _bash-write-patterns.js)\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix gate-quality-gate — {describe the issue}\"",
      ].join("\n"),
    };
  }

  // For new files (Write tool): force .js.pending for LIVE hooks only
  var isLiveHooks = filePath.indexOf("/hooks/run-modules/") >= 0;
  if (tool === "Write") {
    if (filePath.endsWith(".js.pending")) return null;
    var bn = require("path").basename(filePath);
    if (bn.startsWith("_")) return null;
    if (isLiveHooks && filePath.endsWith(".js") && !fs.existsSync(filePath)) {
      return {
        decision: "block",
        reason: [
          "BLOCKED: New live hook must be .js.pending for verification.",
          "WHY: Direct .js writes to live hooks skip the verification workflow — bugs go live instantly.",
          "NEXT STEPS:",
          "1. Write to: " + filePath + ".pending",
          "2. Test the module: node setup.js --test-module " + basename.replace(".js", ""),
          "3. Activate: mv " + filePath + ".pending \nFALSE POSITIVE? File a TODO in hook-runner: \"Fix gate-quality-gate — {describe the issue}\"" + filePath,
        ].join("\n"),
      };
    }

    var content = (input.tool_input || {}).content || "";
    var issues = [];

    if (content.indexOf("// WHY:") === -1) {
      issues.push("Missing '// WHY:' comment");
    }
    if (content.indexOf("// TOOLS:") === -1) {
      issues.push("Missing '// TOOLS:' comment");
    }
    if (content.indexOf("INCIDENT HISTORY") === -1 && content.indexOf("INCIDENT:") === -1) {
      issues.push("Missing INCIDENT HISTORY section");
    }
    var hasDescBlock = (content.indexOf("┌─") !== -1) || (content.indexOf("/**") !== -1) ||
                       (content.match(/\/\/ .+\n\/\/ .+\n\/\/ .+/) !== null);
    if (!hasDescBlock) {
      issues.push("Missing description block");
    }
    var hasLogging = content.indexOf("hook-log.jsonl") !== -1 ||
                     content.indexOf("hook-log.js") !== -1 ||
                     content.indexOf("appendFileSync") !== -1;
    if (!hasLogging) {
      issues.push("Missing logging to hook-log.jsonl");
    }

    if (issues.length > 0) {
      return {
        decision: "block",
        reason: "BLOCKED: New gate module missing required metadata: \nFALSE POSITIVE? File a TODO in hook-runner: \"Fix gate-quality-gate — {describe the issue}\"" + issues.join(", ") + "\n" +
          "WHY: Gates without WHY/TOOLS/logging are invisible, unattributable, and unmaintainable.\n" +
          "NEXT STEPS:\n" +
          "1. Add // WHY: comment explaining the incident that caused this gate\n" +
          "2. Add // TOOLS: listing the tool(s) this gate applies to\n" +
          "3. Add logging (appendFileSync to hook-log.jsonl)\n" +
          "File: " + basename,
      };
    }
  }

  if (tool === "Edit") {
    var oldStr = (input.tool_input || {}).old_string || "";
    var newStr = (input.tool_input || {}).new_string || "";
    if (oldStr.indexOf("// WHY:") !== -1 && newStr.indexOf("// WHY:") === -1) {
      return {
        decision: "block",
        reason: "BLOCKED: Edit removes '// WHY:' comment from \nFALSE POSITIVE? File a TODO in hook-runner: \"Fix gate-quality-gate — {describe the issue}\"" + basename + ".\n" +
          "WHY: The WHY comment is the gate's institutional memory — without it, future sessions can't understand the gate's purpose and may disable it.\n" +
          "NEXT STEPS:\n1. Keep the // WHY: comment (update its text if needed)\n2. If the gate is being removed entirely, use the _disabled/ folder instead",
      };
    }
    if (oldStr.indexOf("// TOOLS:") !== -1 && newStr.indexOf("// TOOLS:") === -1) {
      return {
        decision: "block",
        reason: "BLOCKED: Edit removes '// TOOLS:' tag from \nFALSE POSITIVE? File a TODO in hook-runner: \"Fix gate-quality-gate — {describe the issue}\"" + basename + ".\n" +
          "WHY: The TOOLS tag enables load-time filtering — without it, this module loads for every tool call (~5ms overhead per invocation across all tools).\n" +
          "NEXT STEPS:\n1. Keep the // TOOLS: tag (update its value if the gate now applies to different tools)\n2. If the gate applies to all tools, use // TOOLS: *",
      };
    }
  }

  return null;
};

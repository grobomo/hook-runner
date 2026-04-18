// TOOLS: Edit, Write
// WORKFLOW: shtd, starter
// WHY: A rogue Claude tab silently weakened spec-gate.js by removing Bash from
// the gated tools list. No audit trail, no alert. Any session could modify hooks
// to bypass its own enforcement. This gate now locks hook editing to the
// hook-runner project only, with static weakening detection for all changes.
// T339: Project-locked + weakening detection + self-edit protection.
"use strict";
// Hook editing gate: ONLY the hook-runner project can edit hook infrastructure.
// Other projects get a hard block — no exceptions.
// Within hook-runner, edits are validated:
//   1. Static weakening detection (removes blocks, guts gates)
//   2. WORKFLOW tag and WHY comment required on modules
//   3. UserPromptSubmit modules forbidden
//   4. settings.json hook config changes blocked outside hook-runner
var fs = require("fs");
var path = require("path");

// Files that are hook infrastructure (protected)
function isProtectedPath(norm) {
  // Hook modules — all files in run-modules/ are protected (not just .js)
  // T464: stop-message.txt was unprotected, allowing direct edits from other projects
  if (norm.indexOf("/run-modules/") !== -1) return "module";
  // Runners
  if (/\/run-[a-z]+\.js$/.test(norm) && norm.indexOf("/.claude/hooks/") !== -1) return "runner";
  // Core hook files
  if (norm.indexOf("/.claude/hooks/") !== -1) {
    var base = path.basename(norm);
    if (base === "load-modules.js" || base === "workflow.js" || base === "workflow-cli.js" ||
        base === "hook-log.js" || base === "run-async.js" || base === "constants.js") return "core";
  }
  // Settings files (hook config)
  if (/\/.claude\/settings(\.local)?\.json$/.test(norm)) return "settings";
  return null;
}

// Check if current project is hook-runner
function isHookRunnerProject() {
  var projDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/").toLowerCase();
  return projDir.indexOf("/hook-runner") !== -1;
}

// Static weakening detector — fast, no LLM dependency
function detectWeakening(content, tool) {
  var lineCount = content.split("\n").length;
  // Write (full file): check if module claims to enforce but never blocks
  if (tool === "Write" && lineCount > 10) {
    var hasBlock = /decision[\s]*:[\s]*['"]block['"]/.test(content);
    var nameSuggestsGate = /gate|enforce|block|prevent|forbid/i.test(content);
    if (!hasBlock && nameSuggestsGate) {
      return { decision: "block", reason: "Module name/comments suggest enforcement but no block decisions found" };
    }
  }
  // Edit: catch bare "return null" replacing enforcement logic in gate modules
  if (tool === "Edit" && lineCount <= 2) {
    var trimmed = content.trim();
    if (/^\s*return\s+null;?\s*$/.test(trimmed)) {
      return { decision: "block", reason: "Replacing enforcement logic with bare return null" };
    }
  }
  return null;
}

// Log hook edit attempt to tamper-proof audit trail
function auditLog(filePath, tool, approved, reason, projectDir) {
  try {
    var logDir = path.join(process.env.HOME || process.env.USERPROFILE || "", ".system-monitor");
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    var entry = JSON.stringify({
      ts: new Date().toISOString(),
      file: path.basename(filePath),
      tool: tool,
      project: projectDir,
      approved: approved,
      reason: reason.substring(0, 200),
      pid: process.pid
    }) + "\n";
    fs.appendFileSync(path.join(logDir, "hook-audit.jsonl"), entry);
  } catch (e) { /* best effort */ }
}

// T395: Detect Bash cp/mv/copy targeting hooks dir (bypass of Write/Edit gate)
function checkBashHookCopy(command) {
  if (!command) return null;
  // Patterns: cp/copy/mv source target, where target is hooks dir
  var hooksPatterns = [
    /\b(cp|copy|mv|install)\b.*['"\/]\.claude\/hooks\//,
    /\b(cp|copy|mv|install)\b.*~\/\.claude\/hooks\//,
    /\b(cp|copy|mv|install)\b.*\$HOME\/\.claude\/hooks\//,
    /\b(cp|copy|mv|install)\b.*run-modules\//
  ];
  for (var i = 0; i < hooksPatterns.length; i++) {
    if (hooksPatterns[i].test(command)) return true;
  }
  return false;
}

module.exports = function(input) {
  var tool = input.tool_name;

  // T395: Check Bash commands that copy files into hooks dir
  if (tool === "Bash") {
    var cmd = ((input.tool_input || {}).command || "");
    if (checkBashHookCopy(cmd)) {
      var projectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
      if (!isHookRunnerProject()) {
        auditLog("(bash-copy)", "Bash", false, "BASH BYPASS: " + cmd.substring(0, 100), projectDir);
        return {
          decision: "block",
          reason: "HOOK EDITING GATE: Bash copy/move to hooks dir is blocked.\n" +
            "WHY: Claude used cp/mv to copy modules directly into ~/.claude/hooks/,\n" +
            "bypassing the Write/Edit gate. All hook changes must go through hook-runner.\n\n" +
            "Your project: " + (projectDir || "(unknown)") + "\n" +
            "Command: " + cmd.substring(0, 120) + "\n\n" +
            "TO MODIFY HOOKS: Open a Claude Code session in the hook-runner project.\n" +
            "  All hook changes must go through hook-runner's specs, tests, and guardrails."
        };
      }
      // In hook-runner project: allow (this is the sync-live workflow)
    }
    return null;
  }

  if (tool !== "Edit" && tool !== "Write") return null;

  var ti = input.tool_input;
  if (typeof ti === "string") { try { ti = JSON.parse(ti); } catch(e) { ti = {}; } }
  var filePath = (ti || {}).file_path || "";
  if (!filePath) return null;
  var norm = filePath.replace(/\\/g, "/");
  var base = path.basename(norm);

  // Check if this is a protected file
  var protectedType = isProtectedPath(norm);
  if (!protectedType) return null;

  var projectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");

  // PROJECT LOCK: Only hook-runner project can edit hook infrastructure
  // hook-runner IS the gatekeeper — it can edit all hooks including this file.
  // The weakening detector + quality checks still apply to all edits.
  if (!isHookRunnerProject()) {
    auditLog(filePath, tool, false, "WRONG PROJECT: " + projectDir, projectDir);
    return {
      decision: "block",
      reason: "HOOK EDITING GATE: Hook edits are locked to the hook-runner project.\n" +
        "WHY: A rogue Claude tab silently weakened spec-gate.js to bypass SHTD.\n" +
        "No session outside hook-runner can modify hook infrastructure.\n\n" +
        "Your project: " + (projectDir || "(unknown)") + "\n" +
        "Protected file: " + base + " (" + protectedType + ")\n\n" +
        "TO MODIFY HOOKS: Open a Claude Code session in the hook-runner project.\n" +
        "  All hook changes must go through hook-runner's specs, tests, and guardrails."
    };
  }

  // --- We're in hook-runner project. Apply quality checks + weakening detection. ---

  // Get the content being written
  var content = "";
  if (tool === "Write") {
    content = (ti || {}).content || "";
  } else {
    content = (ti || {}).new_string || "";
  }
  if (!content) return null;

  var issues = [];

  // For runners: check exit code patterns
  if (protectedType === "runner") {
    if (/process\.exit\(0\)/.test(content) && /block|decision/.test(content)) {
      issues.push("Runner uses exit(0) for blocks — must use exit(1) so the TUI shows the block");
    }
  }

  // For modules: check WORKFLOW tag and WHY comment (Write only, not Edit fragments)
  // T464: only enforce JS-specific tags on .js files — .txt/.yaml/.yml are data files
  if (protectedType === "module") {
    var isJsFile = /\.js$/.test(norm);
    if (tool === "Write" && isJsFile) {
      if (!/\/\/ WORKFLOW:/.test(content)) {
        issues.push("Missing // WORKFLOW: tag — every module must declare its workflow");
      }
      if (!/\/\/ WHY:/.test(content)) {
        issues.push("Missing // WHY: comment — explain the real incident that caused this module");
      }
    }

    // UserPromptSubmit modules forbidden
    if (/UserPromptSubmit/.test(norm)) {
      issues.push("UserPromptSubmit modules are FORBIDDEN. Any bug locks the user out " +
        "of their session with no recovery path. Move logic to PreToolUse/PostToolUse/Stop.");
    }
  }

  // Static issues found — block immediately
  if (issues.length > 0) {
    auditLog(filePath, tool, false, "QUALITY: " + issues[0], projectDir);
    return {
      decision: "block",
      reason: "HOOK EDITING GATE: Quality issues detected:\n" +
        issues.map(function(i) { return "  - " + i; }).join("\n") + "\n\n" +
        "FIX: Address the issues above before saving.\nFile: " + base
    };
  }

  // WEAKENING DETECTOR: static pattern check (fast, no LLM dependency)
  if (protectedType === "module" || protectedType === "runner" || protectedType === "core") {
    var weakening = detectWeakening(content, tool);
    if (weakening) {
      auditLog(filePath, tool, false, "WEAKENING: " + weakening, projectDir);
      return {
        decision: "block",
        reason: "HOOK EDITING GATE: Enforcement weakening detected.\n" +
          "WHY: " + weakening + "\n\n" +
          "This edit appears to reduce enforcement. If intentional, edit manually.\n" +
          "File: " + base
      };
    }
    auditLog(filePath, tool, true, "PASSED static checks", projectDir);
  }

  return null;
};

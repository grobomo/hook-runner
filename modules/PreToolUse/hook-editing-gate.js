// WORKFLOW: shtd
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
//   4. Self-edit of THIS file always blocked (bootstrap protection)
//   5. settings.json hook config changes blocked outside hook-runner
var fs = require("fs");
var path = require("path");

// Files that are hook infrastructure (protected)
function isProtectedPath(norm) {
  // Hook modules
  if (norm.indexOf("/run-modules/") !== -1 && norm.indexOf(".js", norm.length - 3) !== -1) return "module";
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

module.exports = function(input) {
  var tool = input.tool_name;
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

  // BOOTSTRAP PROTECTION: editing this file itself is ALWAYS blocked.
  // This prevents any session (even hook-runner) from weakening the gate.
  // To modify hook-editing-gate.js, the user must edit it manually.
  if (base === "hook-editing-gate.js") {
    auditLog(filePath, tool, false, "SELF-EDIT BLOCKED: bootstrap protection", projectDir);
    return {
      decision: "block",
      reason: "HOOK EDITING GATE: SELF-EDIT BLOCKED.\n" +
        "WHY: This file is the root enforcement gate. If Claude can edit it,\n" +
        "Claude can remove all enforcement. This is the bootstrap problem —\n" +
        "the lock cannot unlock itself.\n\n" +
        "TO MODIFY: Edit this file manually (not through Claude Code).\n" +
        "Location: ~/.claude/hooks/run-modules/PreToolUse/hook-editing-gate.js"
    };
  }

  // PROJECT LOCK: Only hook-runner project can edit hook infrastructure
  if (!isHookRunnerProject()) {
    auditLog(filePath, tool, false, "WRONG PROJECT: " + projectDir, projectDir);
    return {
      decision: "block",
      reason: "HOOK EDITING GATE: Hook edits are locked to the hook-runner project.\n" +
        "WHY: A rogue Claude tab silently weakened spec-gate.js to bypass SHTD.\n" +
        "No session outside hook-runner can modify hook infrastructure.\n\n" +
        "Your project: " + (projectDir || "(unknown)") + "\n" +
        "Protected file: " + base + " (" + protectedType + ")\n\n" +
        "TO MODIFY HOOKS: Run:\n" +
        "  python ~/Documents/ProjectsCL1/context-reset/context_reset.py --project-dir ~/Documents/ProjectsCL1/_grobomo/hook-runner\n" +
        "Hook-runner has specs, tests, and guardrails for safe hook changes."
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
  if (protectedType === "module") {
    if (tool === "Write") {
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

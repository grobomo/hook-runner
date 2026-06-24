// TOOLS: Edit, Write
// WORKFLOW: shtd, starter, haiku-rules
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
    // T827: Watchdog is the last line of defense — changes require audit trail
    if (base === "hook-runner-watchdog.js") return "watchdog";
  }
  // Settings files (hook config)
  if (/\/.claude\/settings(\.local)?\.json$/.test(norm)) return "settings";
  return null;
}

// Check if current project is hook-runner
function isHookRunnerProject() {
  var projDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/").toLowerCase();
  // If CLAUDE_PROJECT_DIR is set, use it authoritatively
  if (projDir) return projDir.indexOf("/hook-runner") !== -1;
  // T779: Fallback to cwd only when CLAUDE_PROJECT_DIR is not set
  var cwd = process.cwd().replace(/\\/g, "/").toLowerCase();
  return cwd.indexOf("/hook-runner") !== -1;
}

// Static weakening detector — fast, no LLM dependency
function detectWeakening(content, tool) {
  var lineCount = content.split("\n").length;
  // Write (full file): check if module claims to enforce but never blocks
  if (tool === "Write" && lineCount > 10) {
    var hasBlock = /decision[\s]*:[\s]*['"]block['"]/.test(content);
    // T822: Only check non-comment code for gate-like keywords.
    // "// never block" in a comment was triggering false positive.
    var codeOnly = content.split("\n").map(function(l) {
      // Remove full-line comments
      if (/^\s*\/\//.test(l) || /^\s*\*/.test(l) || /^\s*#/.test(l)) return "";
      // Strip inline comments (// ...) from code lines
      return l.replace(/\/\/.*$/, "");
    }).join("\n");
    var nameSuggestsGate = /gate|enforce|block|prevent|forbid/i.test(codeOnly);
    if (!hasBlock && nameSuggestsGate) {
      return { decision: "block", reason: "Module name/comments suggest enforcement but no block decisions found\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix hook-editing-gate — {describe the issue}\"" };
    }
  }
  // Edit: catch bare "return null" replacing enforcement logic in gate modules
  if (tool === "Edit" && lineCount <= 2) {
    var trimmed = content.trim();
    if (/^\s*return\s+null;?\s*$/.test(trimmed)) {
      return { decision: "block", reason: "Replacing enforcement logic with bare return null\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix hook-editing-gate — {describe the issue}\"" };
    }
  }
  // T759: Block exit(0) in any hook module — hooks that exit 0 are invisible in TUI.
  // Stop hooks MUST exit 1 to be visible. PreToolUse exits 0 for pass (correct)
  // but Stop modules should never silently pass.
  // T767b: EXCEPTION — the re-entrant guard in run-stop.js MUST use exit(0).
  // exit(1) on re-entrant causes infinite loop: Claude responds → stop fires →
  // re-entrant → stdout → Claude responds → stop fires → ...
  if (/process\.exit\s*\(\s*0\s*\)/.test(content)) {
    // Skip if this is the re-entrant guard (stop_hook_active + exit 0 = correct behavior)
    if (!/stop_hook_active/.test(content)) {
      return {
        decision: "block",
        reason: "BLOCKED: process.exit(0) in hook module.\nWHY: Hooks that exit 0 are invisible in the TUI — the user cannot see them working. T759: every stop hook must exit 1.\nNEXT STEPS:\n1. Replace process.exit(0) with process.exit(1)\n2. Ensure the hook always outputs to stdout (JSON) and stderr (human-readable)\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix hook-editing-gate — {describe the issue}\""
      };
    }
  }
  // T767b: Block exit(1) near stop_hook_active — re-entrant guard MUST stay exit(0).
  // Changing it to exit(1) causes an infinite loop where Claude keeps responding to
  // the stop hook output, triggering another stop, triggering the re-entrant guard,
  // which outputs more text, causing Claude to respond again...
  // Only check Edit (small snippets) — Write (full file) uses proximity check in runner section.
  if (tool === "Edit" && /stop_hook_active/.test(content) && /process\.exit\s*\(\s*1\s*\)/.test(content)) {
    return {
      decision: "block",
      reason: "BLOCKED: process.exit(1) near stop_hook_active re-entrant guard.\nWHY: The re-entrant guard MUST use exit(0). exit(1) causes an infinite loop — stop hook output triggers Claude to respond, which fires another stop, which hits the re-entrant guard, which outputs more text. T767b.\nNEXT STEPS:\n1. Keep process.exit(0) for the re-entrant guard\n2. exit(1) is correct for all OTHER paths in run-stop.js\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix hook-editing-gate — {describe the issue}\""
    };
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

// T395+T618: Detect Bash commands that modify hook files (bypass of Write/Edit gate)
function checkBashHookCopy(command) {
  if (!command) return null;
  var hookPathPattern = /\.claude\/hooks\/|run-modules\//;
  if (!hookPathPattern.test(command)) return null;

  var modifyPatterns = [
    /\b(cp|copy|mv|install)\b/,
    /\bsed\s+-i/,
    /\bperl\s+-[ip]/,
    /\bawk\b.*-i\s+inplace/,
    /\btee\b/,
    />\s*[^\s]*\.claude\/hooks\//,
    />\s*[^\s]*run-modules\//,
    /\bpython3?\s+.*write_text\b/,
    /\bcat\s*>.*\.claude\/hooks\//,
    /\bcat\s*>.*run-modules\//
  ];
  for (var i = 0; i < modifyPatterns.length; i++) {
    if (modifyPatterns[i].test(command)) return true;
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
          reason: "BLOCKED: Bash copy/move operations to hooks directory\nWHY: A previous incident where an unverified process removed required specifications from spec-gate.js demonstrates the need to restrict direct file modifications to critical gate configurations\nNEXT STEPS:\n1. Use the official gate configuration management interface instead of direct file operations\n2. Submit changes through code review process to verify modifications before deployment\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix hook-editing-gate — {describe the issue}\""
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

  // T635: UNIVERSAL UPS BLOCK — no project can add UserPromptSubmit hooks to settings.json.
  // A broken UPS hook locks the user out of their entire session with no recovery path.
  // This check fires BEFORE the project lock so it protects ALL projects including hook-runner.
  if (protectedType === "settings") {
    var settingsContent = "";
    if (tool === "Write") {
      settingsContent = ((ti || {}).content || "");
    } else if (tool === "Edit") {
      settingsContent = ((ti || {}).new_string || "");
    }
    if (/UserPromptSubmit/i.test(settingsContent)) {
      auditLog(filePath, tool, false, "UPS HOOK BLOCKED: " + base, projectDir);
      return {
        decision: "block",
        reason: "BLOCKED: UserPromptSubmit hooks in settings.json\nWHY: Prevents accidental removal of critical security validators like Bash filtering from spec-gate.js\nNEXT STEPS:\n1. Remove the hook entry from settings.json\n2. Verify spec-gate.js contains all required language validators before deploying\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix hook-editing-gate — {describe the issue}\""
      };
    }
  }

  // PROJECT LOCK: Only hook-runner project can edit hook infrastructure
  // hook-runner IS the gatekeeper — it can edit all hooks including this file.
  // The weakening detector + quality checks still apply to all edits.
  if (!isHookRunnerProject()) {
    // T823: settings.json contains non-hook fields (effortLevel, model, env, permissions)
    // that any session should be able to edit. Only block if the edit touches hooks.
    if (protectedType === "settings") {
      var editContent = "";
      if (tool === "Write") {
        // Full file Write always blocked — could remove hooks entirely
        auditLog(filePath, tool, false, "SETTINGS WRITE: " + projectDir, projectDir);
        return {
          decision: "block",
          reason: "BLOCKED: Full settings.json rewrite outside hook-runner\nWHY: Writing the entire settings.json could remove or alter hook configuration. Use Edit to change specific fields instead.\nNEXT STEPS:\n1. Use Edit tool to change only the field you need (effortLevel, model, env, permissions)\n2. If you need to modify hooks, file a TODO in hook-runner\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix hook-editing-gate — {describe the issue}\""
        };
      }
      // Edit: check if the change touches hook-related content
      editContent = ((ti || {}).old_string || "") + " " + ((ti || {}).new_string || "");
      var hookPatterns = /\bhooks\b|PreToolUse|PostToolUse|SessionStart|UserPromptSubmit|\bStop\b.*command|run-pretooluse|run-posttooluse|run-stop|run-sessionstart|run-userpromptsubmit|hook-runner|run-modules/i;
      if (hookPatterns.test(editContent)) {
        auditLog(filePath, tool, false, "HOOK EDIT: " + projectDir, projectDir);
        return {
          decision: "block",
          reason: "BLOCKED: Hook configuration edit in settings.json outside hook-runner\nWHY: A rogue Claude instance removed critical Bash support from spec-gate.js by editing hooks without project restrictions\nNEXT STEPS:\n1. File a TODO in hook-runner for hook config changes\n2. Non-hook fields (effortLevel, model, env, permissions) can be edited freely\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix hook-editing-gate — {describe the issue}\""
        };
      }
      // Non-hook field edit — allow it
      auditLog(filePath, tool, true, "SETTINGS NON-HOOK: " + ((ti || {}).new_string || "").substring(0, 50), projectDir);
      return null;
    }
    auditLog(filePath, tool, false, "WRONG PROJECT: " + projectDir, projectDir);
    return {
      decision: "block",
      reason: "BLOCKED: Hook edits outside the hook-runner project\nWHY: A rogue Claude instance removed critical Bash support from spec-gate.js by editing hooks without project restrictions\nNEXT STEPS:\n1. Verify your edits are in the hook-runner project directory\n2. Contact the maintainers if you need to modify hooks in other projects\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix hook-editing-gate — {describe the issue}\""
    };
  }

  // --- We're in hook-runner project. Apply quality checks + weakening detection. ---

  // T600: Even in hook-runner, settings.json edits should only target ~/.claude/
  // or hook-runner's own .claude/. Editing settings.json in unrelated projects
  // (e.g. lab-worker/.claude/settings.json) bypassed all gates — no TODO, no PR.
  if (protectedType === "settings") {
    var homeDir = (process.env.HOME || process.env.USERPROFILE || "").replace(/\\/g, "/");
    // Normalize POSIX drive prefix (/c/Users) to Windows (C:/Users) for comparison
    var normWin = norm.replace(/^\/([a-zA-Z])\//, function(_, d) { return d.toUpperCase() + ":/"; });
    var homeDirWin = homeDir.replace(/^\/([a-zA-Z])\//, function(_, d) { return d.toUpperCase() + ":/"; });
    var projDirWin = projectDir.replace(/^\/([a-zA-Z])\//, function(_, d) { return d.toUpperCase() + ":/"; });
    var normLower = normWin.toLowerCase();
    var isHomeSettings = homeDirWin && normLower.indexOf(homeDirWin.toLowerCase() + "/.claude/") === 0;
    var isOwnSettings = normLower.indexOf(projDirWin.toLowerCase().replace(/\/$/, "") + "/.claude/") === 0;
    if (!isHomeSettings && !isOwnSettings) {
      auditLog(filePath, tool, false, "FOREIGN SETTINGS: " + norm, projectDir);
      return {
        decision: "block",
        reason: "HOOK EDITING GATE: Cannot edit settings.json in another project.\n\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix hook-editing-gate — {describe the issue}\"" +
          "WHY: hook-runner trust only extends to ~/.claude/ and its own .claude/.\n" +
          "Editing " + base + " in a foreign project bypasses that project's gates.\n\n" +
          "Target: " + norm + "\n" +
          "FIX: Open a session in that project and edit its settings there,\n" +
          "  or write a TODO in that project's TODO.md."
      };
    }
  }

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
    // T767b: For run-stop.js Write (full file): verify re-entrant guard uses exit(0), not exit(1)
    // Scan forward from stop_hook_active for the FIRST process.exit — it must be exit(0)
    if (tool === "Write" && /run-stop/.test(norm)) {
      var lines = content.split("\n");
      for (var li = 0; li < lines.length; li++) {
        if (/stop_hook_active/.test(lines[li])) {
          for (var lj = li + 1; lj <= Math.min(lines.length - 1, li + 3); lj++) {
            if (/process\.exit/.test(lines[lj])) {
              if (/process\.exit\s*\(\s*1\s*\)/.test(lines[lj])) {
                issues.push("T767b: Re-entrant guard (stop_hook_active) at line " + (li+1) +
                  " exits with exit(1) at line " + (lj+1) + " — MUST be exit(0) or infinite loop occurs");
              }
              break; // Only check the first exit after stop_hook_active
            }
          }
          break;
        }
      }
    }
  }

  // For modules: check WORKFLOW tag and WHY comment (Write only, not Edit fragments)
  // T464: only enforce JS-specific tags on .js files — .txt/.yaml/.yml are data files
  if (protectedType === "module") {
    var isJsFile = /\.js$/.test(norm);
    if (tool === "Write" && isJsFile) {
      if (!/\/\/ WORKFLOW:/.test(content) && !/auto-activ/i.test(content)) {
        issues.push("Missing // WORKFLOW: tag — every module must declare its workflow (or auto-activation)");
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

  // T827: Watchdog edits get enhanced audit logging
  if (protectedType === "watchdog") {
    auditLog(filePath, tool, true, "WATCHDOG EDIT — enhanced audit", projectDir);
  }

  // Static issues found — block immediately
  if (issues.length > 0) {
    auditLog(filePath, tool, false, "QUALITY: " + issues[0], projectDir);
    return {
      decision: "block",
      reason: "HOOK EDITING GATE: Quality issues detected:\n" +
        issues.map(function(i) { return "  - " + i; }).join("\n") + "\n\n" +
        "FIX: Address the issues above before saving.\nFile: " + base + "\n" +
        "FALSE POSITIVE? File a TODO in hook-runner: \"Fix hook-editing-gate — {describe the issue}\""
    };
  }

  // WEAKENING DETECTOR: static pattern check (fast, no LLM dependency)
  if (protectedType === "module" || protectedType === "runner" || protectedType === "core" || protectedType === "watchdog") {
    var weakening = detectWeakening(content, tool);
    if (weakening) {
      var weakenReason = (weakening && weakening.reason) ? weakening.reason : String(weakening);
      auditLog(filePath, tool, false, "WEAKENING: " + weakenReason, projectDir);
      return {
        decision: "block",
        reason: "HOOK EDITING GATE: Enforcement weakening detected.\n\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix hook-editing-gate — {describe the issue}\"\n" +
          "WHY: " + weakenReason + "\n\n" +
          "This edit appears to reduce enforcement. If intentional, edit manually.\n" +
          "File: " + base
      };
    }
    auditLog(filePath, tool, true, "PASSED static checks", projectDir);
  }

  return null;
};

#!/usr/bin/env node
"use strict";
// T750: Hook Runner Watchdog
// A completely separate hook that fires AFTER hook-runner on each event.
// Validates that hook-runner executed correctly — catches crashes, missing
// modules, silent failures. Works even when hook-runner itself is broken.
//
// WHY: Hook-runner crashed (T747: missing hook-debug.js) and no one noticed
// until the stop hook stopped working entirely. This watchdog would have
// caught it immediately.
//
// Setup: Add as a SECOND hook entry for each event in settings.json:
//   "PreToolUse": [
//     { "type": "command", "command": "node ~/.claude/hooks/run-pretooluse.js" },
//     { "type": "command", "command": "node ~/.claude/hooks/hook-runner-watchdog.js PreToolUse" }
//   ]
//
// Toggle: node hook-runner-watchdog.js on|off|status
// Flag:   ~/.claude/hooks/.watchdog-enabled

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || process.env.USERPROFILE || "/home/ubu";
var HOOKS_DIR = path.join(HOME, ".claude", "hooks");
var FLAG_FILE = path.join(HOOKS_DIR, ".watchdog-enabled");
var LOG_PATH = path.join(HOOKS_DIR, "hook-log.jsonl");
var WATCHDOG_LOG = path.join(HOOKS_DIR, "watchdog-log.jsonl");
var MAX_AGE_MS = 60000; // hook-runner should have written within 60s

// --- Toggle ---
function isEnabled() {
  if (process.env.HOOK_WATCHDOG === "1") return true;
  try { fs.statSync(FLAG_FILE); return true; } catch (e) { return false; }
}

// --- Check hook-log.jsonl for recent runner activity ---
function checkHookLog(event) {
  var issues = [];

  try {
    var stat = fs.statSync(LOG_PATH);
    var ageMs = Date.now() - stat.mtimeMs;

    if (ageMs > MAX_AGE_MS) {
      issues.push("hook-log.jsonl last modified " + Math.round(ageMs / 1000) + "s ago (expected <5s) — hook-runner may not have fired");
    }

    // Read last 20 lines, check for this event
    var content = fs.readFileSync(LOG_PATH, "utf-8").trim();
    var lines = content.split("\n");
    var tail = lines.slice(-20);
    var recentForEvent = [];
    var errors = [];
    var now = Date.now();

    for (var i = 0; i < tail.length; i++) {
      try {
        var entry = JSON.parse(tail[i]);
        var entryAge = now - new Date(entry.ts).getTime();
        if (entryAge > MAX_AGE_MS) continue; // too old

        if (entry.event === event) {
          recentForEvent.push(entry);
          if (entry.result === "error" || entry.result === "crash" || entry.error) {
            errors.push(entry.module + ": " + (entry.error || entry.reason || "unknown error"));
          }
        }
      } catch (e) {} // skip unparseable lines
    }

    if (recentForEvent.length === 0) {
      issues.push("No " + event + " entries in hook-log.jsonl within last 5s — hook-runner may have crashed before logging");
    }

    if (errors.length > 0) {
      issues.push("Module errors detected: " + errors.join("; "));
    }
  } catch (e) {
    if (e.code === "ENOENT") {
      issues.push("hook-log.jsonl not found — hook-runner has never written logs");
    } else {
      issues.push("Cannot read hook-log.jsonl: " + e.message);
    }
  }

  return issues;
}

// --- Check runner script exists and has valid syntax ---
function checkRunnerHealth(event) {
  var issues = [];
  var runnerMap = {
    PreToolUse: "run-pretooluse.js",
    PostToolUse: "run-posttooluse.js",
    Stop: "run-stop.js",
    SessionStart: "run-sessionstart.js",
    UserPromptSubmit: "run-userpromptsubmit.js"
  };

  var runnerName = runnerMap[event];
  if (!runnerName) return issues;

  var runnerPath = path.join(HOOKS_DIR, runnerName);
  if (!fs.existsSync(runnerPath)) {
    issues.push("Runner script missing: " + runnerPath);
    return issues;
  }

  // Check syntax by trying to require key dependencies
  try {
    var content = fs.readFileSync(runnerPath, "utf-8");
    // Check for require() calls to files that must exist
    var requires = content.match(/require\(["']([^"']+)["']\)/g) || [];
    for (var i = 0; i < requires.length; i++) {
      var match = requires[i].match(/require\(["']([^"']+)["']\)/);
      if (!match) continue;
      var reqPath = match[1];
      // Only check relative requires
      if (reqPath.startsWith("./") || reqPath.startsWith("../")) {
        var absPath = path.resolve(path.dirname(runnerPath), reqPath);
        // Try with and without .js extension
        if (!fs.existsSync(absPath) && !fs.existsSync(absPath + ".js")) {
          issues.push("Runner requires missing file: " + reqPath + " (resolved: " + absPath + ")");
        }
      }
    }
  } catch (e) {
    issues.push("Cannot read runner: " + e.message);
  }

  return issues;
}

// --- Check load-modules.js exists ---
function checkModuleLoader() {
  var loaderPath = path.join(HOOKS_DIR, "load-modules.js");
  if (!fs.existsSync(loaderPath)) {
    return ["load-modules.js missing — no modules can load"];
  }
  return [];
}

// --- Log watchdog results ---
function logWatchdog(event, issues) {
  var entry = {
    ts: new Date().toISOString(),
    watchdog: true,
    event: event,
    session: (process.env.CLAUDE_SESSION_ID || "").slice(0, 8),
    issues: issues.length,
    details: issues.length > 0 ? issues.join("; ") : "clean"
  };
  try {
    fs.appendFileSync(WATCHDOG_LOG, JSON.stringify(entry) + "\n");
  } catch (e) {}
}

// --- LLM-powered self-healing (T754) ---
// L1 (Haiku): quick classify — is this auto-fixable?
// L2 (Sonnet): deeper analysis — what's the fix?
var HAIKU_CLIENT_PATH = path.join(HOOKS_DIR, "haiku-client.js");

function callLLM(prompt, model, caller) {
  try {
    var haiku = require(HAIKU_CLIENT_PATH);
    return haiku.call({
      prompt: prompt,
      caller: caller || "watchdog-heal",
      jsonMode: true,
      maxTokens: model === "sonnet" ? 800 : 300,
      timeoutMs: model === "sonnet" ? 15000 : 8000,
      model: model || "haiku"
    });
  } catch (e) {
    return { ok: false, error: "haiku-client unavailable: " + e.message };
  }
}

function diagnoseAndHeal(issues) {
  if (issues.length === 0) return null;

  // Step 1: L1 classification — which issues are auto-fixable?
  var classifyPrompt = [
    "You are a hook system diagnostic tool. Classify each issue as fixable or needs-human.",
    "",
    "ISSUES:",
    issues.map(function(i, idx) { return (idx + 1) + ". " + i; }).join("\n"),
    "",
    "For each issue, determine:",
    "- fixable: can be resolved by copying a missing file, fixing a path, or restarting a service",
    "- needs-human: requires code changes, design decisions, or external access",
    "",
    "Reply with JSON: {\"issues\": [{\"id\": 1, \"fixable\": true/false, \"category\": \"missing-file|bad-syntax|crash|config\", \"brief\": \"one sentence\"}]}"
  ].join("\n");

  var l1Result = callLLM(classifyPrompt, "haiku", "watchdog-classify");
  if (!l1Result.ok || !l1Result.parsed) {
    return { classified: false, error: l1Result.error || "L1 parse failed", raw: l1Result.content };
  }

  var classified = l1Result.parsed.issues || [];
  var fixable = classified.filter(function(i) { return i.fixable; });

  if (fixable.length === 0) {
    return { classified: true, fixable: 0, total: classified.length, items: classified, repairs: [] };
  }

  // Step 2: L2 analysis — generate repair plan for fixable issues
  var fixableDesc = fixable.map(function(i) {
    return "Issue " + i.id + " (" + i.category + "): " + i.brief;
  }).join("\n");

  var healPrompt = [
    "You are a hook system repair tool. Generate concrete repair commands for these issues.",
    "",
    "CONTEXT:",
    "- Hook runner lives at: " + HOOKS_DIR,
    "- Modules in: " + HOOKS_DIR + "/run-modules/{PreToolUse,PostToolUse,Stop,SessionStart}/",
    "- Key files: load-modules.js, haiku-client.js, hook-debug.js, run-*.js",
    "- Repo source: " + path.join(process.cwd(), "modules/"),
    "- Backup dir: " + BACKUP_DIR,
    "",
    "FIXABLE ISSUES:",
    fixableDesc,
    "",
    "For each issue, provide a repair action. Reply with JSON:",
    "{\"repairs\": [{\"issue_id\": 1, \"action\": \"copy|restart|fix-config\", \"command\": \"node -e '...'\", \"description\": \"what this does\", \"risk\": \"low|medium|high\"}]}",
    "",
    "RULES: Only suggest low-risk repairs (copy from backup, fix paths). Never suggest deleting files or modifying gate logic."
  ].join("\n");

  var l2Result = callLLM(healPrompt, "sonnet", "watchdog-heal");
  var repairs = [];
  if (l2Result.ok && l2Result.parsed && l2Result.parsed.repairs) {
    repairs = l2Result.parsed.repairs;
  }

  return {
    classified: true,
    fixable: fixable.length,
    total: classified.length,
    items: classified,
    repairs: repairs,
    l1Ms: l1Result.ms,
    l2Ms: l2Result.ms
  };
}

function executeRepairs(diagnosis, dryRun) {
  if (!diagnosis || !diagnosis.repairs || diagnosis.repairs.length === 0) return [];
  var results = [];
  for (var i = 0; i < diagnosis.repairs.length; i++) {
    var repair = diagnosis.repairs[i];
    if (repair.risk !== "low") {
      results.push({ issue: repair.issue_id, status: "skipped", reason: "risk=" + repair.risk + " (only low-risk auto-executed)" });
      continue;
    }
    if (dryRun) {
      results.push({ issue: repair.issue_id, status: "dry-run", command: repair.command, description: repair.description });
      continue;
    }
    try {
      var cp = require("child_process");
      cp.execSync(repair.command, { timeout: 10000, windowsHide: true, encoding: "utf-8" });
      results.push({ issue: repair.issue_id, status: "repaired", description: repair.description });
    } catch (e) {
      results.push({ issue: repair.issue_id, status: "failed", error: e.message.slice(0, 100) });
    }
  }
  return results;
}

// --- Git root finder ---
function findGitRoot(startDir) {
  var dir = startDir;
  for (var d = 0; d < 20; d++) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    var parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// --- Analyze watchdog log and generate actionable report ---
function analyze() {
  var lines;
  try {
    lines = fs.readFileSync(WATCHDOG_LOG, "utf-8").trim().split("\n");
  } catch (e) {
    console.log("No watchdog log found. Enable watchdog and run some hooks first.");
    return;
  }

  var entries = [];
  for (var i = 0; i < lines.length; i++) {
    try {
      var e = JSON.parse(lines[i]);
      if (e.watchdog) entries.push(e);
    } catch (ex) {}
  }

  if (entries.length === 0) {
    console.log("No watchdog entries found.");
    return;
  }

  // Categorize issues
  var categories = {
    "missing-runner": { count: 0, events: [], fix: "Reinstall runner: copy from hook-runner repo to ~/.claude/hooks/" },
    "missing-dependency": { count: 0, files: [], fix: "Install missing file or fix require() path in runner" },
    "missing-loader": { count: 0, fix: "Copy load-modules.js from hook-runner repo to ~/.claude/hooks/" },
    "no-log-entry": { count: 0, events: [], fix: "Hook-runner may have crashed before logging — check node -c on runner script" },
    "module-error": { count: 0, modules: [], fix: "Check module syntax: node -c ~/.claude/hooks/run-modules/<Event>/<module>.js" },
    "stale-log": { count: 0, fix: "hook-log.jsonl not being updated — hook-runner may not be firing" }
  };

  var totalIssues = 0;
  var cleanCount = 0;

  for (var j = 0; j < entries.length; j++) {
    var entry = entries[j];
    if (entry.issues === 0) { cleanCount++; continue; }
    totalIssues += entry.issues;
    var details = entry.details || "";

    if (/Runner script missing/.test(details)) {
      categories["missing-runner"].count++;
      categories["missing-runner"].events.push(entry.event);
    }
    if (/requires missing file/.test(details)) {
      categories["missing-dependency"].count++;
      var depMatch = details.match(/missing file: ([^\s(]+)/);
      if (depMatch) categories["missing-dependency"].files.push(depMatch[1]);
    }
    if (/load-modules\.js missing/.test(details)) {
      categories["missing-loader"].count++;
    }
    if (/No .* entries in hook-log/.test(details)) {
      categories["no-log-entry"].count++;
      categories["no-log-entry"].events.push(entry.event);
    }
    if (/Module errors detected/.test(details)) {
      categories["module-error"].count++;
      var modMatch = details.match(/Module errors detected: (.+)/);
      if (modMatch) categories["module-error"].modules.push(modMatch[1]);
    }
    if (/last modified.*ago/.test(details)) {
      categories["stale-log"].count++;
    }
  }

  // Report
  console.log("=== Watchdog Analysis ===");
  console.log("Log entries: " + entries.length + " (" + cleanCount + " clean, " + (entries.length - cleanCount) + " with issues)");
  console.log("Total issues: " + totalIssues);
  console.log("");

  var actionItems = [];
  var catNames = Object.keys(categories);
  for (var k = 0; k < catNames.length; k++) {
    var cat = categories[catNames[k]];
    if (cat.count === 0) continue;
    var label = catNames[k].replace(/-/g, " ").toUpperCase();
    var detail = "";
    if (cat.events && cat.events.length > 0) detail = " (" + unique(cat.events).join(", ") + ")";
    if (cat.files && cat.files.length > 0) detail = " (" + unique(cat.files).join(", ") + ")";
    if (cat.modules && cat.modules.length > 0) detail = " (" + unique(cat.modules).slice(0, 3).join("; ") + ")";
    console.log("  " + label + ": " + cat.count + " occurrence(s)" + detail);
    console.log("    FIX: " + cat.fix);
    actionItems.push("- [ ] Fix " + catNames[k] + detail + " — " + cat.fix);
  }

  if (actionItems.length === 0) {
    console.log("  No recurring issues found. All healthy.");
  } else {
    console.log("\n--- Action Items ---");
    for (var a = 0; a < actionItems.length; a++) {
      console.log(actionItems[a]);
    }

    // Auto-append to TODO.md if in a git repo
    var root = findGitRoot(process.cwd());
    if (root) {
      var todoPath = path.join(root, "TODO.md");
      if (fs.existsSync(todoPath)) {
        console.log("\nAppending to " + todoPath + "...");
        var todoBlock = "\n## Watchdog Issues (auto-generated " + new Date().toISOString().slice(0, 10) + ")\n\n" +
          actionItems.join("\n") + "\n";
        try {
          fs.appendFileSync(todoPath, todoBlock);
          console.log("Done. Review TODO.md for new items.");
        } catch (e) {
          console.log("Could not write to TODO.md: " + e.message);
        }
      }
    }
  }
}

function unique(arr) {
  var seen = {};
  return arr.filter(function(v) { return seen[v] ? false : (seen[v] = true); });
}

// --- Deploy with safety net ---
// Copies watchdog to live hooks dir with automatic backup + verify + rollback
function deploy() {
  console.log("=== Deploying watchdog to live hooks ===\n");

  // Step 1: Backup current state
  console.log("1. Backing up current hooks...");
  var backupCount = backup();
  if (backupCount === 0) {
    console.log("   WARNING: No hook files found to backup. Continuing anyway.");
  } else {
    console.log("   Backed up " + backupCount + " files");
  }

  // Step 2: Copy watchdog to live hooks
  console.log("2. Installing watchdog...");
  var src = __filename;
  var dst = path.join(HOOKS_DIR, "hook-runner-watchdog.js");
  try {
    fs.copyFileSync(src, dst);
    console.log("   Copied to " + dst);
  } catch (e) {
    console.log("   FAILED: " + e.message);
    return false;
  }

  // Step 3: Verify the installed copy works
  console.log("3. Verifying installation...");
  try {
    var child_process = require("child_process");
    var result = child_process.execFileSync("node", [dst, "status"], {
      encoding: "utf-8", timeout: 5000, windowsHide: true
    });
    if (result.indexOf("Health Check") >= 0) {
      console.log("   Verification passed");
    } else {
      console.log("   WARNING: Unexpected output — check manually");
    }
  } catch (e) {
    console.log("   VERIFICATION FAILED: " + e.message);
    console.log("   Rolling back...");
    var rollback = restore();
    console.log("   Rolled back " + rollback.restored + " files");
    return false;
  }

  // Step 4: Show next steps
  console.log("\n=== Deployed successfully ===");
  console.log("Watchdog at: " + dst);
  console.log("Backup at: " + BACKUP_DIR);
  console.log("\nTo add to settings.json (AFTER hook-runner entries):");
  console.log('  "Stop": [');
  console.log('    { existing hook-runner entry },');
  console.log('    { "type": "command", "command": "node ' + dst.replace(/\\/g, "/") + ' Stop" }');
  console.log('  ]');
  console.log("\nTo enable:  node " + dst.replace(/\\/g, "/") + " on");
  console.log("To monitor: node " + dst.replace(/\\/g, "/") + " monitor");
  console.log("To rollback: node " + dst.replace(/\\/g, "/") + " restore");
  return true;
}

// --- T826: Stop decision quality checks ---
function checkStopDecision() {
  var issues = [];
  try {
    var content = fs.readFileSync(LOG_PATH, "utf-8").trim();
    var lines = content.split("\n");
    var tail = lines.slice(-40);
    var now = Date.now();
    var stopEntry = null;
    var hasConflict = false;
    var conflictDetails = "";

    // Find the most recent Stop event entry
    for (var i = tail.length - 1; i >= 0; i--) {
      try {
        var entry = JSON.parse(tail[i]);
        var age = now - new Date(entry.ts).getTime();
        if (age > MAX_AGE_MS) continue;
        if (entry.event === "Stop" && entry.decision) {
          if (!stopEntry) stopEntry = entry;
        }
        if (entry.type === "decision-conflict" && age < MAX_AGE_MS) {
          hasConflict = true;
          conflictDetails = entry.details || entry.reason || "unknown conflict";
        }
      } catch (e) {}
    }

    if (!stopEntry) {
      issues.push("Stop hook produced no decision entry — may have crashed");
      return issues;
    }

    // Check 1: User prompt available?
    var prompt = stopEntry.user_prompt || stopEntry.userPrompt || "";
    if (!prompt || prompt === "(not available)" || prompt.length < 3) {
      issues.push("Stop hook decided without user prompt — decision is uninformed");
    }

    // Check 2: DONE with unchecked TODOs?
    var decision = (stopEntry.decision || "").toUpperCase();
    if (decision === "DONE") {
      var projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
      var todoPath = path.join(projectDir, "TODO.md");
      try {
        if (fs.existsSync(todoPath)) {
          var todoContent = fs.readFileSync(todoPath, "utf-8");
          var unchecked = (todoContent.match(/^- \[ \] T\d+/gm) || []).length;
          // Filter out BLOCKED, DEFERRED, DESIGN NEEDED
          var actionable = (todoContent.match(/^- \[ \] T\d+(?!.*(?:BLOCKED|DEFERRED|DESIGN NEEDED))/gm) || []).length;
          if (actionable > 0) {
            issues.push("DONE but " + actionable + " actionable unchecked items in TODO.md");
          }
        }
      } catch (e) {}
    }

    // Check 3: Decision conflicts?
    if (hasConflict) {
      issues.push("Stop rules disagreed: " + String(conflictDetails).slice(0, 100));
    }
  } catch (e) {
    // Can't read log — structural check will catch this
  }
  return issues;
}

// --- Main: hook mode ---
// T828: Watchdog is always-on. No toggle. If it's in settings.json, it runs.
function runAsHook(event) {
  var issues = [];
  issues = issues.concat(checkRunnerHealth(event));
  issues = issues.concat(checkModuleLoader());
  issues = issues.concat(checkHookLog(event));

  // T826: For Stop events, also check decision quality
  if (event === "Stop") {
    issues = issues.concat(checkStopDecision());
  }

  logWatchdog(event, issues);

  if (issues.length > 0) {
    // Output diagnostic to stderr (visible in TUI)
    var msg = "WATCHDOG [" + event + "]: " + issues.length + " issue(s) detected:\n" +
      issues.map(function(i) { return "  - " + i; }).join("\n") + "\n" +
      "Run: node ~/.claude/hooks/hook-runner-watchdog.js status";
    process.stderr.write(msg + "\n");
    // Non-blocking — return empty JSON (pass), diagnostics go to stderr
    process.stdout.write("null\n");
  }
  // If clean, produce no output (pass)
}

// --- Backup/Restore ---
var BACKUP_DIR = path.join(HOOKS_DIR, ".watchdog-backup");

function backup() {
  try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch (e) {}
  var files = ["load-modules.js", "haiku-client.js", "hook-log.js",
    "run-pretooluse.js", "run-posttooluse.js", "run-stop.js",
    "run-sessionstart.js", "run-userpromptsubmit.js", "hook-debug.js"];
  var backed = 0;
  for (var i = 0; i < files.length; i++) {
    var src = path.join(HOOKS_DIR, files[i]);
    var dst = path.join(BACKUP_DIR, files[i]);
    try {
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
        backed++;
      }
    } catch (e) {}
  }
  // Also backup run-modules directory listing (not files — too many)
  try {
    var manifest = {};
    var events = ["PreToolUse", "PostToolUse", "Stop", "SessionStart"];
    for (var e = 0; e < events.length; e++) {
      var dir = path.join(HOOKS_DIR, "run-modules", events[e]);
      try {
        manifest[events[e]] = fs.readdirSync(dir).filter(function(f) { return f.endsWith(".js"); });
      } catch (ex) { manifest[events[e]] = []; }
    }
    fs.writeFileSync(path.join(BACKUP_DIR, "manifest.json"),
      JSON.stringify({ ts: new Date().toISOString(), files: files, modules: manifest }, null, 2));
  } catch (e) {}
  return backed;
}

function restore() {
  if (!fs.existsSync(BACKUP_DIR)) return { restored: 0, error: "No backup found at " + BACKUP_DIR };
  var manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, "manifest.json"), "utf-8"));
  } catch (e) { return { restored: 0, error: "Cannot read backup manifest" }; }

  var restored = 0;
  var files = manifest.files || [];
  for (var i = 0; i < files.length; i++) {
    var src = path.join(BACKUP_DIR, files[i]);
    var dst = path.join(HOOKS_DIR, files[i]);
    try {
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
        restored++;
      }
    } catch (e) {}
  }
  return { restored: restored, backupTs: manifest.ts };
}

// --- Monitor loop with auto-rollback ---
function monitor(intervalSec) {
  intervalSec = intervalSec || 30;
  var consecutiveFailures = 0;
  var MAX_FAILURES = 3;

  console.log("Watchdog monitor started (interval: " + intervalSec + "s, auto-rollback after " + MAX_FAILURES + " consecutive failures)");
  console.log("Press Ctrl+C to stop\n");

  function check() {
    var allIssues = [];
    var events = ["PreToolUse", "Stop"];
    for (var i = 0; i < events.length; i++) {
      allIssues = allIssues.concat(checkRunnerHealth(events[i]));
    }
    allIssues = allIssues.concat(checkModuleLoader());

    var ts = new Date().toISOString().slice(11, 19);
    if (allIssues.length === 0) {
      consecutiveFailures = 0;
      console.log(ts + " OK — runners healthy");
    } else {
      consecutiveFailures++;
      console.log(ts + " ISSUE (" + consecutiveFailures + "/" + MAX_FAILURES + "): " + allIssues.join("; "));

      if (consecutiveFailures >= MAX_FAILURES) {
        console.log("\n*** AUTO-ROLLBACK triggered after " + MAX_FAILURES + " consecutive failures ***");
        var result = restore();
        if (result.restored > 0) {
          console.log("Restored " + result.restored + " files from backup (taken: " + result.backupTs + ")");
          consecutiveFailures = 0;
          logWatchdog("rollback", ["auto-rollback after " + MAX_FAILURES + " failures: " + allIssues.join("; ")]);
          console.log("\n--- Post-rollback analysis ---");
          analyze();
        } else {
          console.log("Rollback failed: " + (result.error || "unknown"));
        }
      }
    }
    logWatchdog("monitor", allIssues);
  }

  check(); // immediate first check
  setInterval(check, intervalSec * 1000);
}

// --- Safe settings.json management (T762) ---
var SETTINGS_PATH = path.join(HOME, ".claude", "settings.json");
var SETTINGS_BACKUP = path.join(BACKUP_DIR, "settings.json.bak");
var WATCHDOG_HOOK_MARKER = "hook-runner-watchdog.js";

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8")); } catch (e) { return null; }
}

function writeSettings(obj) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(obj, null, 2) + "\n", "utf-8");
}

function validateSettings(obj) {
  // Must be an object with hooks
  if (!obj || typeof obj !== "object") return "settings is not an object";
  if (!obj.hooks || typeof obj.hooks !== "object") return "missing hooks section";
  // Must have at least Stop (our primary target)
  if (!obj.hooks.Stop || !Array.isArray(obj.hooks.Stop)) return "missing Stop hooks array";
  // Verify JSON round-trips cleanly
  try { JSON.parse(JSON.stringify(obj)); } catch (e) { return "JSON round-trip failed: " + e.message; }
  return null;
}

function backupSettings() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    if (fs.existsSync(SETTINGS_PATH)) {
      fs.copyFileSync(SETTINGS_PATH, SETTINGS_BACKUP);
      return true;
    }
  } catch (e) {}
  return false;
}

function restoreSettings() {
  try {
    if (fs.existsSync(SETTINGS_BACKUP)) {
      fs.copyFileSync(SETTINGS_BACKUP, SETTINGS_PATH);
      return true;
    }
  } catch (e) {}
  return false;
}

function isWatchdogInstalled(settings) {
  if (!settings || !settings.hooks || !settings.hooks.Stop) return false;
  var stops = settings.hooks.Stop;
  for (var i = 0; i < stops.length; i++) {
    var hooks = stops[i].hooks || [];
    for (var j = 0; j < hooks.length; j++) {
      if (hooks[j].command && hooks[j].command.indexOf(WATCHDOG_HOOK_MARKER) >= 0) return true;
    }
  }
  return false;
}

function installToSettings() {
  console.log("=== Installing watchdog into settings.json ===\n");

  // Step 1: Read current settings
  var settings = readSettings();
  if (!settings) {
    console.log("ERROR: Cannot read " + SETTINGS_PATH);
    return false;
  }

  // Step 2: Check if already installed
  if (isWatchdogInstalled(settings)) {
    console.log("Watchdog already installed in settings.json. Nothing to do.");
    return true;
  }

  // Step 3: Backup
  console.log("1. Backing up settings.json...");
  if (backupSettings()) {
    console.log("   Saved to " + SETTINGS_BACKUP);
  } else {
    console.log("   WARNING: Could not backup. Proceeding anyway.");
  }

  // Step 4: Add watchdog hook entry to Stop array
  console.log("2. Adding watchdog to Stop hooks...");
  var watchdogPath = path.join(HOOKS_DIR, "hook-runner-watchdog.js").replace(/\\/g, "/");
  var newEntry = {
    hooks: [{
      type: "command",
      command: "node \"" + watchdogPath + "\" Stop",
      timeout: 15
    }]
  };
  settings.hooks.Stop.push(newEntry);

  // Step 5: Validate before writing
  console.log("3. Validating...");
  var validationError = validateSettings(settings);
  if (validationError) {
    console.log("   VALIDATION FAILED: " + validationError);
    console.log("   Settings NOT modified.");
    return false;
  }

  // Step 6: Write
  console.log("4. Writing settings.json...");
  try {
    writeSettings(settings);
  } catch (e) {
    console.log("   WRITE FAILED: " + e.message);
    console.log("   Rolling back...");
    restoreSettings();
    return false;
  }

  // Step 7: Verify the written file is valid JSON
  console.log("5. Verifying written file...");
  var reread = readSettings();
  if (!reread || !isWatchdogInstalled(reread)) {
    console.log("   VERIFICATION FAILED — file corrupted or entry missing");
    console.log("   Rolling back...");
    restoreSettings();
    return false;
  }

  console.log("\n=== Watchdog installed successfully ===");
  console.log("Stop hooks now: " + reread.hooks.Stop.length + " entries (hook-runner + watchdog)");
  console.log("Backup at: " + SETTINGS_BACKUP);
  console.log("To undo: node hook-runner-watchdog.js uninstall");

  // Step 8: Enable watchdog
  try { fs.mkdirSync(path.dirname(FLAG_FILE), { recursive: true }); } catch (e) {}
  fs.writeFileSync(FLAG_FILE, new Date().toISOString() + "\n");
  console.log("Watchdog enabled (flag file created)");
  return true;
}

function uninstallFromSettings() {
  console.log("=== Removing watchdog from settings.json ===\n");

  var settings = readSettings();
  if (!settings) {
    console.log("ERROR: Cannot read " + SETTINGS_PATH);
    return false;
  }

  if (!isWatchdogInstalled(settings)) {
    console.log("Watchdog not found in settings.json. Nothing to remove.");
    return true;
  }

  // Backup first
  console.log("1. Backing up settings.json...");
  backupSettings();

  // Remove watchdog entries from Stop array
  console.log("2. Removing watchdog entries...");
  var newStops = [];
  for (var i = 0; i < settings.hooks.Stop.length; i++) {
    var entry = settings.hooks.Stop[i];
    var hasWatchdog = false;
    var hooks = entry.hooks || [];
    for (var j = 0; j < hooks.length; j++) {
      if (hooks[j].command && hooks[j].command.indexOf(WATCHDOG_HOOK_MARKER) >= 0) {
        hasWatchdog = true;
        break;
      }
    }
    if (!hasWatchdog) newStops.push(entry);
  }
  settings.hooks.Stop = newStops;

  // Validate and write
  console.log("3. Writing settings.json...");
  var validationError = validateSettings(settings);
  if (validationError) {
    console.log("   VALIDATION FAILED: " + validationError);
    restoreSettings();
    return false;
  }

  writeSettings(settings);

  // Disable watchdog
  try { fs.unlinkSync(FLAG_FILE); } catch (e) {}

  console.log("\n=== Watchdog removed ===");
  console.log("Stop hooks now: " + settings.hooks.Stop.length + " entries");
  console.log("To reinstall: node hook-runner-watchdog.js install");
  return true;
}

// --- CLI mode ---
if (require.main === module) {
  var cmd = process.argv[2] || "status";

  if (cmd === "on") {
    console.log("Watchdog is always-on (T828). If installed in settings.json, it runs.");
    console.log("To install: node hook-runner-watchdog.js install");
  } else if (cmd === "off") {
    console.log("Watchdog is always-on (T828). To remove: node hook-runner-watchdog.js uninstall");
  } else if (cmd === "status") {
    console.log("Watchdog: ALWAYS-ON (T828)");
    console.log("Log: " + WATCHDOG_LOG);

    // Show recent watchdog log
    try {
      var logLines = fs.readFileSync(WATCHDOG_LOG, "utf-8").trim().split("\n");
      var recent = logLines.slice(-10);
      console.log("\nRecent checks (" + recent.length + "):");
      for (var i = 0; i < recent.length; i++) {
        try {
          var e = JSON.parse(recent[i]);
          var status = e.issues === 0 ? "OK" : e.issues + " ISSUE(S)";
          console.log("  " + e.ts.slice(11, 19) + " " + (e.event || "").padEnd(14) + " " + status +
            (e.issues > 0 ? " — " + e.details.slice(0, 80) : ""));
        } catch (ex) {}
      }
    } catch (e) {
      console.log("\nNo watchdog log yet.");
    }

    // Run health checks now
    console.log("\n--- Health Check ---");
    var events = ["PreToolUse", "PostToolUse", "Stop", "SessionStart"];
    var totalIssues = 0;
    for (var ev = 0; ev < events.length; ev++) {
      var evIssues = checkRunnerHealth(events[ev]);
      if (evIssues.length > 0) {
        console.log(events[ev] + ": " + evIssues.join(", "));
        totalIssues += evIssues.length;
      } else {
        console.log(events[ev] + ": OK");
      }
    }
    var loaderIssues = checkModuleLoader();
    if (loaderIssues.length > 0) {
      console.log("ModuleLoader: " + loaderIssues.join(", "));
      totalIssues += loaderIssues.length;
    } else {
      console.log("ModuleLoader: OK");
    }
    console.log("\n" + (totalIssues === 0 ? "All healthy." : totalIssues + " issue(s) found."));

  } else if (cmd === "deploy") {
    deploy();

  } else if (cmd === "analyze") {
    analyze();

  } else if (cmd === "heal") {
    var dryRun = process.argv.indexOf("--dry-run") >= 0;
    console.log("=== Watchdog Self-Healing" + (dryRun ? " (DRY RUN)" : "") + " ===\n");

    // Gather current issues
    var healIssues = [];
    var healEvents = ["PreToolUse", "PostToolUse", "Stop", "SessionStart"];
    for (var hi = 0; hi < healEvents.length; hi++) {
      healIssues = healIssues.concat(checkRunnerHealth(healEvents[hi]));
    }
    healIssues = healIssues.concat(checkModuleLoader());
    healIssues = healIssues.concat(checkHookLog("PreToolUse"));

    if (healIssues.length === 0) {
      console.log("No issues found. System healthy.");
    } else {
      console.log("Found " + healIssues.length + " issue(s). Calling LLM for diagnosis...\n");
      var diagnosis = diagnoseAndHeal(healIssues);
      if (!diagnosis) {
        console.log("Diagnosis returned null.");
      } else if (!diagnosis.classified) {
        console.log("L1 classification failed: " + (diagnosis.error || "unknown"));
        if (diagnosis.raw) console.log("Raw: " + diagnosis.raw.slice(0, 200));
      } else {
        console.log("Classification (L1, " + (diagnosis.l1Ms || "?") + "ms):");
        for (var ci = 0; ci < diagnosis.items.length; ci++) {
          var item = diagnosis.items[ci];
          console.log("  " + item.id + ". [" + (item.fixable ? "FIXABLE" : "HUMAN") + "] " + item.category + ": " + item.brief);
        }
        console.log("\nFixable: " + diagnosis.fixable + "/" + diagnosis.total);

        if (diagnosis.repairs.length > 0) {
          console.log("\nRepair plan (L2, " + (diagnosis.l2Ms || "?") + "ms):");
          for (var ri = 0; ri < diagnosis.repairs.length; ri++) {
            var r = diagnosis.repairs[ri];
            console.log("  " + r.issue_id + ". [" + r.risk + "] " + r.description);
            console.log("     $ " + (r.command || "").slice(0, 100));
          }

          var repairResults = executeRepairs(diagnosis, dryRun);
          console.log("\nResults:");
          for (var rr = 0; rr < repairResults.length; rr++) {
            var res = repairResults[rr];
            console.log("  Issue " + res.issue + ": " + res.status + (res.reason ? " (" + res.reason + ")" : "") + (res.error ? " — " + res.error : ""));
          }
        } else {
          console.log("\nNo repair actions generated.");
        }

        logWatchdog("heal", healIssues.concat(["diagnosis: " + diagnosis.fixable + "/" + diagnosis.total + " fixable"]));
      }
    }

  } else if (cmd === "backup") {
    var count = backup();
    console.log("Backed up " + count + " hook files to " + BACKUP_DIR);
    console.log("Restore with: node hook-runner-watchdog.js restore");

  } else if (cmd === "restore") {
    var result = restore();
    if (result.restored > 0) {
      console.log("Restored " + result.restored + " files from backup (taken: " + result.backupTs + ")");
    } else {
      console.log("Restore failed: " + (result.error || "nothing to restore"));
    }

  } else if (cmd === "set-timeout") {
    var timeoutSec = parseInt(process.argv[3]);
    var MIN_TIMEOUT = { Stop: 60, PreToolUse: 10, PostToolUse: 10, SessionStart: 30 };
    var event2 = process.argv[4] || "Stop";
    var minForEvent = MIN_TIMEOUT[event2] || 10;
    if (!timeoutSec || timeoutSec < minForEvent) {
      console.log("Usage: node hook-runner-watchdog.js set-timeout <seconds> [event]");
      console.log("  Minimum for " + event2 + ": " + minForEvent + "s (enforced — Stop hooks need time for L1+L2 LLM calls)");
      if (timeoutSec && timeoutSec < minForEvent) {
        console.log("  Requested " + timeoutSec + "s is below minimum. Use at least " + minForEvent + "s.");
      }
      process.exit(1);
    }
    var event = process.argv[4] || "Stop";
    console.log("=== Setting " + event + " hook timeout to " + timeoutSec + "s ===\n");
    console.log("1. Backing up settings.json...");
    backupSettings();
    var stObj = readSettings();
    if (!stObj || !stObj.hooks || !stObj.hooks[event]) {
      console.log("ERROR: No " + event + " hooks found in settings.json");
      process.exit(1);
    }
    var changed = 0;
    for (var ti = 0; ti < stObj.hooks[event].length; ti++) {
      var hks = stObj.hooks[event][ti].hooks || [];
      for (var tj = 0; tj < hks.length; tj++) {
        if (hks[tj].timeout !== timeoutSec) {
          console.log("  Entry " + ti + ": " + (hks[tj].timeout || "default") + "s → " + timeoutSec + "s");
          hks[tj].timeout = timeoutSec;
          changed++;
        }
      }
    }
    if (changed === 0) {
      console.log("All " + event + " hooks already at " + timeoutSec + "s.");
    } else {
      console.log("2. Validating...");
      var valErr = validateSettings(stObj);
      if (valErr) { console.log("VALIDATION FAILED: " + valErr); restoreSettings(); process.exit(1); }
      console.log("3. Writing settings.json...");
      writeSettings(stObj);
      console.log("\nDone. " + changed + " hook(s) updated to " + timeoutSec + "s timeout.");
    }

  } else if (cmd === "install") {
    installToSettings();

  } else if (cmd === "uninstall") {
    uninstallFromSettings();

  } else if (cmd === "monitor") {
    var interval = parseInt(process.argv[3]) || 30;
    monitor(interval);

  } else if (cmd === "PreToolUse" || cmd === "PostToolUse" || cmd === "Stop" ||
             cmd === "SessionStart" || cmd === "UserPromptSubmit") {
    // Called as a hook — event name as argument
    runAsHook(cmd);
  } else {
    console.log("Hook Runner Watchdog — validates hook-runner health");
    console.log("");
    console.log("Toggle:");
    console.log("  node hook-runner-watchdog.js on         Enable watchdog hooks");
    console.log("  node hook-runner-watchdog.js off        Disable watchdog hooks");
    console.log("  node hook-runner-watchdog.js status     Health check + recent log");
    console.log("");
    console.log("Install (safe settings.json management with backup + rollback):");
    console.log("  node hook-runner-watchdog.js install     Add watchdog to settings.json Stop hooks");
    console.log("  node hook-runner-watchdog.js uninstall   Remove watchdog from settings.json");
    console.log("");
    console.log("Deploy (backup + install + verify, auto-rollback on failure):");
    console.log("  node hook-runner-watchdog.js deploy     Safe deploy to live hooks dir");
    console.log("");
    console.log("Backup/Restore:");
    console.log("  node hook-runner-watchdog.js backup     Backup all hook runner files");
    console.log("  node hook-runner-watchdog.js restore    Restore from last backup");
    console.log("");
    console.log("Monitoring:");
    console.log("  node hook-runner-watchdog.js monitor [sec]  Watch loop (default 30s)");
    console.log("                                              Auto-rollback after 3 failures");
    console.log("  node hook-runner-watchdog.js analyze        Analyze log, categorize, write TODOs");
    console.log("  node hook-runner-watchdog.js heal           L1 classify + L2 diagnose + auto-repair");
    console.log("  node hook-runner-watchdog.js heal --dry-run  Same but don't execute repairs");
    console.log("");
    console.log("As a settings.json hook (fires after hook-runner):");
    console.log('  { "type": "command", "command": "node ~/.claude/hooks/hook-runner-watchdog.js Stop" }');
  }
}

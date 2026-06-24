// TOOLS: SessionStart
// WORKFLOW: haiku-rules
// WHY: Things break silently — stop hooks fire but output is invisible, gates get
// disabled, proxy goes down, modules crash. Nobody notices until hours later.
// T831: Single mechanical health check at session start. No LLM. <200ms.
//
// INCIDENT HISTORY:
// 2026-06-02: Stop hook output invisible in TUI for unknown duration. User found out
//   by noticing stop hook feedback appeared as system-reminder not TUI text.
// 2026-06-02: Watchdog was disabled since creation (T750). Never caught anything.
// 2026-05-29: run-stop.js crashed for 24h (T747). No detection.
"use strict";

var fs = require("fs");
var path = require("path");
var http = require("http");

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var HOOKS_DIR = path.join(HOME, ".claude", "hooks");
var HOOK_LOG = path.join(HOOKS_DIR, "hook-log.jsonl");
var WATCHDOG_LOG = path.join(HOOKS_DIR, "watchdog-log.jsonl");
var CORRECTION_LOG = path.join(HOOKS_DIR, "correction-log.jsonl");
var REFLECTION_FLAG = path.join(HOOKS_DIR, ".reflection-pending.json");
var PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "health-report-check";
  entry.event = "SessionStart";
  try { fs.appendFileSync(HOOK_LOG, JSON.stringify(entry) + "\n"); } catch (e) {}
}

function readTail(filePath, lines) {
  try {
    var content = fs.readFileSync(filePath, "utf-8").trim();
    if (!content) return [];
    var all = content.split("\n");
    return all.slice(-lines);
  } catch (e) { return []; }
}

function parseJsonLines(lines) {
  var result = [];
  for (var i = 0; i < lines.length; i++) {
    try { result.push(JSON.parse(lines[i])); } catch (e) {}
  }
  return result;
}

module.exports = function() {
  var checks = [];
  var issues = [];
  var now = Date.now();
  var sessionCutoff = now - 4 * 60 * 60 * 1000; // 4 hours

  // 1. Stop hook firing?
  try {
    var logEntries = parseJsonLines(readTail(HOOK_LOG, 100));
    var stopEntries = logEntries.filter(function(e) {
      return e.event === "Stop" && e.ts && new Date(e.ts).getTime() > sessionCutoff;
    });
    if (stopEntries.length > 0) {
      checks.push("stop-hook-firing");
    } else {
      issues.push("Stop hook has no entries in last 4h — may not be firing");
    }
  } catch (e) {
    issues.push("Cannot read hook-log.jsonl");
  }

  // 2. Stop hook output visible?
  try {
    var recentStops = parseJsonLines(readTail(HOOK_LOG, 200)).filter(function(e) {
      return e.event === "Stop" && e.ts && new Date(e.ts).getTime() > sessionCutoff;
    });
    var hasOutput = recentStops.some(function(e) {
      return e.decision || e.actions || e.reason;
    });
    if (hasOutput) {
      checks.push("stop-hook-output");
    } else if (recentStops.length > 0) {
      issues.push("Stop hook fired but produced no decision/actions — output may be invisible");
    } else {
      checks.push("stop-hook-output"); // no stops to check = pass
    }
  } catch (e) {}

  // 3. Watchdog firing?
  try {
    if (fs.existsSync(WATCHDOG_LOG)) {
      var wdEntries = parseJsonLines(readTail(WATCHDOG_LOG, 20));
      var recentWd = wdEntries.filter(function(e) {
        return e.ts && new Date(e.ts).getTime() > sessionCutoff;
      });
      if (recentWd.length > 0) {
        checks.push("watchdog-firing");
      } else {
        issues.push("Watchdog has no entries in last 4h — may not be installed in settings.json");
      }
    } else {
      issues.push("Watchdog log missing — watchdog may never have run");
    }
  } catch (e) {}

  // 4. Token proxy up?
  // Sync HTTP check with 1s timeout
  try {
    var cp = require("child_process");
    var proxyResult = cp.execFileSync("node", ["-e",
      'var h=require("http");var r=h.get("http://127.0.0.1:4100/health",{timeout:1000},function(res){process.stdout.write(String(res.statusCode))});r.on("error",function(){process.stdout.write("0")})'
    ], { encoding: "utf-8", timeout: 2000, windowsHide: true }).trim();
    if (proxyResult === "200") {
      checks.push("token-proxy");
    } else {
      issues.push("Token proxy at :4100 returned " + proxyResult + " — Haiku gates fail-open");
    }
  } catch (e) {
    issues.push("Token proxy at :4100 unreachable — Haiku gates fail-open");
  }

  // 5. Module count
  try {
    var events = ["PreToolUse", "PostToolUse", "Stop", "SessionStart"];
    var totalModules = 0;
    for (var ei = 0; ei < events.length; ei++) {
      var modDir = path.join(HOOKS_DIR, "run-modules", events[ei]);
      if (fs.existsSync(modDir)) {
        var files = fs.readdirSync(modDir).filter(function(f) {
          return f.endsWith(".js") && f.charAt(0) !== "_";
        });
        totalModules += files.length;
      }
    }
    if (totalModules > 20) {
      checks.push("module-count (" + totalModules + ")");
    } else {
      issues.push("Only " + totalModules + " modules loaded — expected 50+");
    }
  } catch (e) {}

  // 6. Workflow config
  try {
    var wcPath = path.join(HOOKS_DIR, "workflow-config.json");
    if (fs.existsSync(wcPath)) {
      var wc = JSON.parse(fs.readFileSync(wcPath, "utf-8"));
      var enabled = Object.keys(wc).filter(function(k) { return wc[k] === true; });
      if (enabled.length > 0) {
        checks.push("workflows (" + enabled.join(",") + ")");
      } else {
        issues.push("All workflows disabled — most gates are dead");
      }
    }
  } catch (e) {}

  // 7. Settings.json hooks exist
  try {
    var settingsPath = path.join(HOME, ".claude", "settings.json");
    var settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    var hooks = settings.hooks || {};
    var hookEvents = Object.keys(hooks);
    if (hookEvents.length >= 3) {
      checks.push("settings-hooks (" + hookEvents.join(",") + ")");
    } else {
      issues.push("settings.json has only " + hookEvents.length + " hook events — expected 4+");
    }
  } catch (e) {
    issues.push("Cannot read settings.json");
  }

  // 8. Recent errors
  try {
    var errEntries = parseJsonLines(readTail(HOOK_LOG, 200)).filter(function(e) {
      return (e.result === "error" || e.result === "crash" || e.error) &&
             e.ts && new Date(e.ts).getTime() > sessionCutoff;
    });
    if (errEntries.length === 0) {
      checks.push("no-recent-errors");
    } else {
      var errModules = [];
      for (var ej = 0; ej < errEntries.length; ej++) {
        var mod = errEntries[ej].module || "unknown";
        if (errModules.indexOf(mod) === -1) errModules.push(mod);
      }
      issues.push(errEntries.length + " module errors in recent log (" + errModules.slice(0, 3).join(", ") + ")");
    }
  } catch (e) {}

  // 9. Correction backlog
  try {
    if (fs.existsSync(CORRECTION_LOG)) {
      var corrEntries = parseJsonLines(readTail(CORRECTION_LOG, 10));
      var recentCorr = corrEntries.filter(function(e) {
        return e.ts && new Date(e.ts).getTime() > sessionCutoff;
      });
      if (recentCorr.length === 0) {
        checks.push("no-recent-corrections");
      } else {
        checks.push("corrections-logged (" + recentCorr.length + ")");
      }
    } else {
      checks.push("no-correction-log");
    }
  } catch (e) {}

  // 10. Reflection pending
  try {
    if (fs.existsSync(REFLECTION_FLAG)) {
      var rf = JSON.parse(fs.readFileSync(REFLECTION_FLAG, "utf-8"));
      if (rf && !rf.reflected) {
        var rfAge = now - new Date(rf.ts).getTime();
        if (rfAge < 30 * 60 * 1000) {
          issues.push("Reflection pending — correction not yet addressed in TODO.md");
        } else {
          checks.push("reflection-expired");
        }
      } else {
        checks.push("reflection-done");
      }
    } else {
      checks.push("no-reflection-pending");
    }
  } catch (e) {}

  // 11. Self-healing findings from previous session (T807)
  try {
    var findingsPath = path.join(HOOKS_DIR, ".self-healing-findings.json");
    if (fs.existsSync(findingsPath)) {
      var findings = JSON.parse(fs.readFileSync(findingsPath, "utf-8"));
      // Only surface recent findings (< 24h)
      if (findings.ts && (now - new Date(findings.ts).getTime()) < 24 * 60 * 60 * 1000) {
        if (findings.fixable > 0) {
          var issueList = (findings.issues || [])
            .filter(function(i) { return i.fixable; })
            .map(function(i) { return i.path + ": " + i.detail; })
            .slice(0, 3);
          issues.push("Self-healing found " + findings.fixable + " fixable issue(s): " +
            issueList.join("; "));
        } else if (findings.total > 0) {
          checks.push("self-healing (" + findings.total + " non-fixable)");
        } else {
          checks.push("self-healing-clean");
        }
      } else {
        checks.push("self-healing-stale");
      }
    } else {
      checks.push("no-self-healing-data");
    }
  } catch (e) {
    checks.push("self-healing-read-error");
  }

  var total = checks.length + issues.length;
  var passed = checks.length;

  log({
    action: "health-report",
    passed: passed,
    total: total,
    issues: issues.length > 0 ? issues : undefined
  });

  if (issues.length === 0) {
    process.stderr.write("[HEALTH] " + passed + "/" + total + " checks passed\n");
  } else {
    process.stderr.write("[HEALTH] " + passed + "/" + total + " checks passed, " +
      issues.length + " ISSUE(S):\n" +
      issues.map(function(i) { return "  - " + i; }).join("\n") + "\n");
  }

  return null;
};

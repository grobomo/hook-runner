// TOOLS: Bash
// WORKFLOW: shtd, starter, haiku-rules
// WHY: Claude ran close-dead-tabs.ps1 and killed its own session. Process
// termination commands need target verification before execution.
// T795: Block broad/unverified process kills.
// T831: Block specific PID kills when target is in own process tree.
//
// INCIDENT HISTORY:
//   2026-05-28: Claude executed close-dead-tabs.ps1 which killed its own
//   Claude Code process along with the target tabs. No PID verification
//   was done before the bulk kill.
//   2026-06-03: Claude killed its own process 4+ times via various mechanisms:
//   close-dead-tabs.ps1, manage.py cleanup, manage.py supervise, supervisor
//   stale spawn. Each time a different mechanism, same result.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var LOG_PATH = path.join(os.homedir(), ".claude", "hooks", "hook-log.jsonl");

function _log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "process-kill-gate";
  entry.event = "PreToolUse";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8"); } catch (e) {}
}

// Kill commands that destroy processes
var KILL_PATTERNS = [
  /\bkill\s+-9\s+-1\b/,                    // kill all processes owned by user
  /\bkill\s+-9\s+0(?:\s|$)/,               // kill process group
  /\bkillall\b/,                            // kill by name (broad)
  /\bpkill\b/,                              // kill by pattern (broad)
  /\btaskkill\s+\/f\s+\/im\b/i,            // Windows: force kill by image name
  /\btaskkill\s+\/f\s+\/fi\b/i,            // Windows: force kill by filter
  /\bStop-Process\b/i,                      // PowerShell kill
  /\bkill\s+-(?:KILL|TERM|HUP|INT|QUIT)\s/i, // signal-based kills by name
];

// Safe patterns — specific PID kills, dry-runs, queries
var SAFE_PATTERNS = [
  /\bkill\s+[1-9]\d*\b/,                   // kill specific PID (>0, just digits)
  /\bkill\s+-9\s+[1-9]\d*\b/,              // kill -9 specific PID (>0)
  /\bkill\s+-TERM\s+[1-9]\d*\b/,          // SIGTERM specific PID
  /\bkill\s+-15\s+[1-9]\d*\b/,             // SIGTERM by number
  /\btaskkill\s+\/pid\b/i,                 // Windows: kill specific PID
  /--dry-run/i,                             // dry run flag
  /\bps\b/,                                 // process listing (not killing)
  /\bpgrep\b/,                              // process finding (not killing)
  /\btasklist\b/i,                          // Windows process listing
  /\bGet-Process\b/i,                       // PowerShell process listing
  /\bwmic\s+process\s+list\b/i,            // Windows WMI process listing
];

// T831: Get own process tree PIDs (self-kill protection)
function getOwnPids() {
  var pids = [];
  // Own PID
  pids.push(process.pid);
  // Parent PID (node process that spawned us)
  if (process.ppid) pids.push(process.ppid);
  // CLAUDE_PID if set (the actual Claude Code process)
  if (process.env.CLAUDE_PID) pids.push(parseInt(process.env.CLAUDE_PID, 10));
  // Walk up the parent chain via PPID env or /proc
  try {
    var cp = require("child_process");
    // On Windows: wmic gives parent PIDs
    if (os.platform() === "win32") {
      var pid = process.ppid || process.pid;
      for (var depth = 0; depth < 5; depth++) {
        var out = cp.execSync(
          'wmic process where "ProcessId=' + pid + '" get ParentProcessId /format:list 2>nul',
          { timeout: 2000, encoding: "utf-8" }
        ).trim();
        var m = out.match(/ParentProcessId=(\d+)/);
        if (!m) break;
        var parentPid = parseInt(m[1], 10);
        if (parentPid <= 4 || pids.indexOf(parentPid) >= 0) break; // system processes or loop
        pids.push(parentPid);
        pid = parentPid;
      }
    }
  } catch (e) { /* best effort */ }
  return pids.filter(function(p) { return p > 0 && !isNaN(p); });
}

// T831: Extract PIDs from specific kill commands
function extractTargetPids(cmd) {
  var pids = [];
  // kill PID, kill -9 PID, kill -TERM PID
  var killMatches = cmd.match(/\bkill\s+(?:-\w+\s+)?(\d+)/g) || [];
  for (var i = 0; i < killMatches.length; i++) {
    var pidMatch = killMatches[i].match(/(\d+)$/);
    if (pidMatch) pids.push(parseInt(pidMatch[1], 10));
  }
  // taskkill /pid PID
  var taskKillMatches = cmd.match(/\/pid\s+(\d+)/gi) || [];
  for (var j = 0; j < taskKillMatches.length; j++) {
    var tm = taskKillMatches[j].match(/(\d+)/);
    if (tm) pids.push(parseInt(tm[1], 10));
  }
  // Stop-Process -Id PID
  var psMatches = cmd.match(/Stop-Process\s+(?:-Id\s+)?(\d+)/gi) || [];
  for (var k = 0; k < psMatches.length; k++) {
    var pm = psMatches[k].match(/(\d+)/);
    if (pm) pids.push(parseInt(pm[1], 10));
  }
  return pids.filter(function(p) { return p > 0; });
}

// T831: Scripts known to cause self-kill (block unconditionally)
var DANGEROUS_SCRIPTS = [
  /close-dead-tabs/i,
];

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = (input.tool_input || {}).command || "";
  if (!cmd) return null;

  // T831: Block known dangerous scripts unconditionally
  for (var d = 0; d < DANGEROUS_SCRIPTS.length; d++) {
    if (DANGEROUS_SCRIPTS[d].test(cmd)) {
      _log({ result: "block", reason: "dangerous_script", cmd: cmd.slice(0, 100) });
      return {
        decision: "block",
        reason: "BLOCKED: " + cmd.match(DANGEROUS_SCRIPTS[d])[0] + " is blocked\n" +
          "WHY: This script has killed the calling session 3+ times. It uses indiscriminate PID selection.\n" +
          "NEXT STEPS:\n" +
          "1. Identify specific target PIDs with: tasklist /fi or ps aux | grep\n" +
          "2. Kill only those specific PIDs\n" +
          "FALSE POSITIVE? File a TODO in hook-runner: \"Fix process-kill-gate — {describe the issue}\""
      };
    }
  }

  // Strip quoted strings to avoid false positives
  var stripped = cmd
    .replace(/\$\(cat <<'EOF'[\s\S]*?EOF\s*\)/g, "MSG")
    .replace(/\$\(cat <<EOF[\s\S]*?EOF\s*\)/g, "MSG")
    .replace(/"(?:[^"\\]|\\.)*"/g, "STR")
    .replace(/'(?:[^'\\]|\\.)*'/g, "STR");

  var normalized = stripped.replace(/\s+/g, " ").trim();

  // T831: Check specific PID kills against own process tree
  var targetPids = extractTargetPids(normalized);
  if (targetPids.length > 0) {
    var ownPids = getOwnPids();
    for (var t = 0; t < targetPids.length; t++) {
      if (ownPids.indexOf(targetPids[t]) >= 0) {
        _log({ result: "block", reason: "self_kill", targetPid: targetPids[t], ownPids: ownPids, cmd: cmd.slice(0, 100) });
        return {
          decision: "block",
          reason: "BLOCKED: Cannot kill own process (PID " + targetPids[t] + " is in your process tree)\n" +
            "WHY: Claude has killed its own session 4+ times by targeting PIDs in its own process tree\n" +
            "NEXT STEPS:\n" +
            "1. Verify the target PID is NOT in your process tree: " + ownPids.join(", ") + "\n" +
            "2. If the target is in another Claude session, use context-reset instead of kill\n" +
            "FALSE POSITIVE? File a TODO in hook-runner: \"Fix process-kill-gate — {describe the issue}\""
        };
      }
    }
  }

  // Check if any broad kill pattern matches
  var matchedPattern = null;
  for (var i = 0; i < KILL_PATTERNS.length; i++) {
    if (KILL_PATTERNS[i].test(normalized)) {
      matchedPattern = KILL_PATTERNS[i].toString();
      break;
    }
  }
  if (!matchedPattern) return null;

  // Check safe exceptions (specific PID kills already passed self-kill check above)
  for (var j = 0; j < SAFE_PATTERNS.length; j++) {
    if (SAFE_PATTERNS[j].test(normalized)) {
      _log({ result: "pass", reason: "safe pattern", pattern: SAFE_PATTERNS[j].toString(), cmd: cmd.slice(0, 100) });
      return null;
    }
  }

  _log({ result: "block", pattern: matchedPattern, cmd: cmd.slice(0, 100) });

  return {
    decision: "block",
    reason: "BLOCKED: Process termination without target verification\n" +
      "WHY: Claude ran a bulk kill command and terminated its own session — processes must be identified before killing\n" +
      "NEXT STEPS:\n" +
      "1. List processes first: ps aux | grep <name>, tasklist /fi, or pgrep\n" +
      "2. Identify specific PIDs to kill from the listing\n" +
      "3. Kill specific PIDs only: kill <pid> or taskkill /pid <pid>\n" +
      "FALSE POSITIVE? File a TODO in hook-runner: \"Fix process-kill-gate — {describe the issue}\""
  };
};

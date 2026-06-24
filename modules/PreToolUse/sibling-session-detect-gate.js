// TOOLS: Bash, Edit, Write
// WORKFLOW: haiku-rules
// WHY: Two hook-runner tabs ran simultaneously in the same project, both editing
// the same files without knowing about each other. Work was duplicated and
// conflicted. This gate checks the fleet API for sibling sessions and alerts
// when coordination is needed.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ SIBLING SESSION DETECT — Alerts when multiple sessions share a project │
// │                                                                        │
// │ On every Nth tool call (default: every 10), checks fleet API at :4100  │
// │ for other active sessions in the same CLAUDE_PROJECT_DIR.              │
// │ If siblings found, emits a non-blocking warning to stderr with:        │
// │   - How many siblings exist                                            │
// │   - What each sibling is working on (current_task)                     │
// │   - Suggestion to coordinate via TODO.md                               │
// │                                                                        │
// │ INCIDENT HISTORY:                                                      │
// │   2026-05-29: Two tabs both editing hook-runner modules simultaneously │
// │   One running tests, other editing code — no awareness of each other.  │
// └─────────────────────────────────────────────────────────────────────────┘
"use strict";

var fs = require("fs");
var path = require("path");
var http = require("http");

var HOME = process.env.HOME || process.env.USERPROFILE || "/home/ubu";
var LOG_PATH = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");
var FLEET_PORT = 4100;
var CHECK_INTERVAL = 10; // check every N tool calls
var COOLDOWN_MS = 5 * 60 * 1000; // don't alert more than once per 5 min
var STATE_FILE = path.join(HOME, ".claude", "hooks", ".sibling-detect-state.json");

function _log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "sibling-session-detect-gate";
  entry.event = "PreToolUse";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n"); } catch (e) {}
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch (e) {
    return { callCount: 0, lastAlertTs: 0 };
  }
}

function writeState(state) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch (e) {}
}

// Synchronous HTTP GET to fleet API (must be sync for PreToolUse hooks)
function queryFleet() {
  try {
    var cp = require("child_process");
    var result = cp.execFileSync("node", ["-e",
      'var http=require("http");' +
      'var req=http.get("http://127.0.0.1:' + FLEET_PORT + '/api/fleet",function(res){' +
      'var d="";res.on("data",function(c){d+=c});' +
      'res.on("end",function(){process.stdout.write(d)})});' +
      'req.on("error",function(){process.stdout.write("{}")});' +
      'req.setTimeout(2000,function(){req.destroy();process.stdout.write("{}")});'
    ], { encoding: "utf-8", timeout: 3000, windowsHide: true });
    return JSON.parse(result || "{}");
  } catch (e) {
    return {};
  }
}

function normalizeProjectPath(p) {
  return (p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

module.exports = function(input) {
  if (process.env.HOOK_RUNNER_TEST === "1") return null;

  var state = readState();
  state.callCount = (state.callCount || 0) + 1;

  // Only check every N calls to minimize overhead
  if (state.callCount % CHECK_INTERVAL !== 0) {
    writeState(state);
    return null;
  }

  // Cooldown — don't spam alerts
  var now = Date.now();
  if (now - (state.lastAlertTs || 0) < COOLDOWN_MS) {
    writeState(state);
    return null;
  }

  var myProject = normalizeProjectPath(process.env.CLAUDE_PROJECT_DIR);
  var mySession = (process.env.CLAUDE_SESSION_ID || "").slice(0, 8);
  if (!myProject) {
    writeState(state);
    return null;
  }

  var fleet = queryFleet();
  var sessions = fleet.sessions || [];

  // Find siblings: same project, different session, not stale
  var siblings = [];
  for (var i = 0; i < sessions.length; i++) {
    var s = sessions[i];
    var sProject = normalizeProjectPath(s.project || s.cwd || "");
    var sSession = (s.session_id || "").slice(0, 8);

    // Match on project path (could be cwd or project field)
    if (sProject.indexOf(myProject) >= 0 || myProject.indexOf(sProject) >= 0) {
      // Skip self
      if (sSession === mySession) continue;
      // Skip stale sessions (>30min since last checkin)
      if (s.status === "stale") continue;
      siblings.push(s);
    }
  }

  if (siblings.length === 0) {
    _log({ result: "pass", reason: "no siblings (" + sessions.length + " total sessions)" });
    writeState(state);
    return null;
  }

  // Siblings found — alert
  state.lastAlertTs = now;
  writeState(state);

  var siblingInfo = siblings.map(function(s) {
    return "  - Session " + (s.session_id || "unknown").slice(0, 8) +
      ": " + (s.current_task || "unknown task").slice(0, 100);
  }).join("\n");

  var msg = "SIBLING SESSIONS DETECTED: " + siblings.length + " other session(s) in this project.\n" +
    siblingInfo + "\n" +
    "COORDINATE: Check TODO.md for task assignments. Avoid editing the same files.\n" +
    "If one session is running tests, the other should wait or work on different files.";

  _log({ result: "alert", siblings: siblings.length, reason: msg.slice(0, 200) });

  // Non-blocking: write warning to stderr, return null (don't block the tool call)
  process.stderr.write("\n[sibling-session-detect] " + msg + "\n\n");
  return null;
};

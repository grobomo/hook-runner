// TOOLS: Bash, Edit, Write, Read, Agent
// WORKFLOW: haiku-rules
// WHY: Stop hook failures are invisible to Opus — the only signal is absence
//      of system-reminder, which Opus cannot detect. This gate checks turn
//      markers and blocks ONCE to make Opus aware when a stop was missed.
//
// INCIDENT HISTORY:
//   2026-05-20: User reported repeated stop hook failures with no visibility.
//   Opus had no way to know the stop didn't fire — it just saw no system-reminder
//   and continued without enforcement. User frustration logged in hook-log:
//   "I do not see a gucking haiku gate in the tui after your last stop."
//   2026-05-21: "stop hook fired after your last stop. so its clearly working,
//   but not all the time. and you seem unable to tell the difference."
//   T726 created to give Opus mechanical detection of stop failures.
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || process.env.USERPROFILE || "/home/ubu";
var HOOKS_DIR = path.join(HOME, ".claude", "hooks");

module.exports = function (input) {
  if (process.env.HOOK_RUNNER_TEST === "1") return null;

  var sessionId = (process.env.CLAUDE_SESSION_ID || "").slice(0, 8);
  if (!sessionId) return null;

  // T755: Session-scoped markers — each tab gets its own files
  var TURN_MARKER = path.join(HOOKS_DIR, ".last-turn-start-" + sessionId);
  var STOP_MARKER = path.join(HOOKS_DIR, ".last-stop-fired-" + sessionId);
  var ALERT_MARKER = path.join(HOOKS_DIR, ".stop-gap-alerted-" + sessionId);

  var turnData, stopData;
  try { turnData = JSON.parse(fs.readFileSync(TURN_MARKER, "utf-8")); } catch (e) { return null; }
  try { stopData = JSON.parse(fs.readFileSync(STOP_MARKER, "utf-8")); } catch (e) { return null; }

  if (turnData.session !== sessionId) return null;
  if (stopData.session !== sessionId) return null;
  if (turnData.turn <= 1) return null;

  var expectedStopTurn = turnData.turn - 1;
  if (stopData.turn >= expectedStopTurn) return null;

  var alertData;
  try { alertData = JSON.parse(fs.readFileSync(ALERT_MARKER, "utf-8")); } catch (e) { alertData = {}; }
  if (alertData.session === sessionId && alertData.turn === turnData.turn) return null;

  try {
    fs.writeFileSync(ALERT_MARKER, JSON.stringify({ session: sessionId, turn: turnData.turn, ts: new Date().toISOString() }));
  } catch (e) {}

  var missedTurns = expectedStopTurn - stopData.turn;
  return {
    decision: "block",
    reason: "BLOCKED: Stop hook did not execute or signal completion\nWHY: Stop hooks fail silently with no observable signal, leaving Opus unaware of the failure\nNEXT STEPS:\n1. Verify the stop hook handler is registered and logs completion events\n2. Check hook execution logs to confirm the stop hook ran before code generation completed\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix stop-fired-check-gate — {describe the issue}\""
  };
};

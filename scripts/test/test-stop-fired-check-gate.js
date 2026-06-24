// Test stop-fired-check-gate (T726)
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log("  PASS: " + msg); }
  else { failed++; console.log("  FAIL: " + msg); }
}

// Setup: temp hooks dir
var tmpDir = path.join(os.tmpdir(), "t726-test-" + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });

// Override HOME and session ID
var origHome = process.env.HOME;
var origSession = process.env.CLAUDE_SESSION_ID;
var origTest = process.env.HOOK_RUNNER_TEST;

// Create .claude/hooks structure
var hooksDir = path.join(tmpDir, ".claude", "hooks");
fs.mkdirSync(hooksDir, { recursive: true });

process.env.HOME = tmpDir;
process.env.HOOK_RUNNER_TEST = ""; // don't short-circuit
process.env.CLAUDE_SESSION_ID = "test1234-abcd-5678";

// Clear require cache so module picks up new HOME
var modPath = path.join(__dirname, "../../modules/PreToolUse/stop-fired-check-gate.js");
delete require.cache[require.resolve(modPath)];
var gate = require(modPath);

var SESSION_PREFIX = "test1234";
var TURN_MARKER = path.join(hooksDir, ".last-turn-start-" + SESSION_PREFIX);
var STOP_MARKER = path.join(hooksDir, ".last-stop-fired-" + SESSION_PREFIX);
var ALERT_MARKER = path.join(hooksDir, ".stop-gap-alerted-" + SESSION_PREFIX);

var input = { tool_name: "Bash", tool_input: { command: "echo hi" } };

console.log("\n=== stop-fired-check-gate tests ===\n");

console.log("--- Module contract ---");
ok(typeof gate === "function", "exports a function");

console.log("--- No markers ---");
// Clean state
try { fs.unlinkSync(TURN_MARKER); } catch (e) {}
try { fs.unlinkSync(STOP_MARKER); } catch (e) {}
try { fs.unlinkSync(ALERT_MARKER); } catch (e) {}
ok(gate(input) === null, "passes when no markers exist");

console.log("--- First turn (turn=1) ---");
fs.writeFileSync(TURN_MARKER, JSON.stringify({ session: SESSION_PREFIX, turn: 1, ts: new Date().toISOString() }));
fs.writeFileSync(STOP_MARKER, JSON.stringify({ session: SESSION_PREFIX, turn: 0, ts: new Date().toISOString() }));
delete require.cache[require.resolve(modPath)];
gate = require(modPath);
ok(gate(input) === null, "passes on first turn (turn=1)");

console.log("--- Stop fired for previous turn ---");
fs.writeFileSync(TURN_MARKER, JSON.stringify({ session: SESSION_PREFIX, turn: 3, ts: new Date().toISOString() }));
fs.writeFileSync(STOP_MARKER, JSON.stringify({ session: SESSION_PREFIX, turn: 2, ts: new Date().toISOString() }));
try { fs.unlinkSync(ALERT_MARKER); } catch (e) {}
delete require.cache[require.resolve(modPath)];
gate = require(modPath);
ok(gate(input) === null, "passes when stop fired for previous turn");

console.log("--- Stop missed ---");
fs.writeFileSync(TURN_MARKER, JSON.stringify({ session: SESSION_PREFIX, turn: 4, ts: new Date().toISOString() }));
fs.writeFileSync(STOP_MARKER, JSON.stringify({ session: SESSION_PREFIX, turn: 2, ts: new Date().toISOString() }));
try { fs.unlinkSync(ALERT_MARKER); } catch (e) {}
delete require.cache[require.resolve(modPath)];
gate = require(modPath);
var r = gate(input);
ok(r !== null && r.decision === "block", "blocks when stop was missed");
ok(r && /Stop hook/.test(r.reason), "block message mentions stop hook");
ok(r && /FALSE POSITIVE/.test(r.reason), "block message has FALSE POSITIVE escape");

console.log("--- Alert suppression (same turn) ---");
// Alert marker should have been written — second call should pass
delete require.cache[require.resolve(modPath)];
gate = require(modPath);
var r2 = gate(input);
ok(r2 === null, "second call on same turn passes (already alerted)");

console.log("--- Different session markers ---");
fs.writeFileSync(TURN_MARKER, JSON.stringify({ session: "othersid", turn: 5, ts: new Date().toISOString() }));
fs.writeFileSync(STOP_MARKER, JSON.stringify({ session: SESSION_PREFIX, turn: 2, ts: new Date().toISOString() }));
try { fs.unlinkSync(ALERT_MARKER); } catch (e) {}
delete require.cache[require.resolve(modPath)];
gate = require(modPath);
ok(gate(input) === null, "passes when turn marker is from different session");

console.log("--- No session ID ---");
process.env.CLAUDE_SESSION_ID = "";
delete require.cache[require.resolve(modPath)];
gate = require(modPath);
ok(gate(input) === null, "passes when no session ID set");

// Cleanup
process.env.HOME = origHome;
process.env.CLAUDE_SESSION_ID = origSession || "";
process.env.HOOK_RUNNER_TEST = origTest || "";
try { fs.rmSync(tmpDir, { recursive: true }); } catch (e) {}

console.log("\n    " + passed + " passed, " + failed + " failed\n");
process.exit(failed > 0 ? 1 : 0);

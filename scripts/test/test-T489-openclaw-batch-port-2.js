#!/usr/bin/env node
/**
 * T489: Test suite for OpenClaw batch-ported modules (batch 2).
 * Tests the 7 new gate functions by running the original hook-runner
 * CommonJS modules and validating behavior.
 */
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");

var pass = 0;
var fail = 0;

function ok(name, result) {
  if (result) {
    pass++;
    console.log("OK: " + name);
  } else {
    fail++;
    console.log("FAIL: " + name);
  }
}

var modulesDir = path.join(__dirname, "..", "..", "modules");

function runGate(modulePath, input) {
  try {
    delete require.cache[require.resolve(modulePath)];
    var gate = require(modulePath);
    return gate(input);
  } catch (e) {
    return { error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PreToolUse gates
// ═══════════════════════════════════════════════════════════════════════

// ── no-nested-claude ────────────────────────────────────────────────
var nnc = path.join(modulesDir, "PreToolUse", "no-nested-claude.js");

ok("no-nested-claude: blocks claude -p", (function() {
  var r = runGate(nnc, { tool_name: "Bash", tool_input: { command: "claude -p 'what is 2+2'" } });
  return r && r.decision === "block" && /NO NESTED CLAUDE/.test(r.reason);
})());

ok("no-nested-claude: blocks pipe into claude", (function() {
  var r = runGate(nnc, { tool_name: "Bash", tool_input: { command: "cat prompt.txt | claude" } });
  return r && r.decision === "block";
})());

ok("no-nested-claude: blocks claude --print", (function() {
  var r = runGate(nnc, { tool_name: "Bash", tool_input: { command: "claude --print < input.txt" } });
  return r && r.decision === "block";
})());

ok("no-nested-claude: allows grep with claude in pattern", (function() {
  var r = runGate(nnc, { tool_name: "Bash", tool_input: { command: 'grep -E "vpn|monitor|claude" log.txt' } });
  return r === null;
})());

ok("no-nested-claude: allows git commands mentioning claude", (function() {
  var r = runGate(nnc, { tool_name: "Bash", tool_input: { command: "git commit -m 'update claude config'" } });
  return r === null;
})());

ok("no-nested-claude: allows non-Bash", (function() {
  var r = runGate(nnc, { tool_name: "Read", tool_input: { file_path: "/some/file" } });
  return r === null;
})());

ok("no-nested-claude: allows normal bash commands", (function() {
  var r = runGate(nnc, { tool_name: "Bash", tool_input: { command: "ls -la" } });
  return r === null;
})());

// ── disk-space-guard ────────────────────────────────────────────────
var dsg = path.join(modulesDir, "PreToolUse", "disk-space-guard.js");

// Set up a mock state file for testing
var stateFile = path.join(os.homedir(), ".claude", ".disk-space-alert");
var stateExisted = fs.existsSync(stateFile);
var stateBackup = stateExisted ? fs.readFileSync(stateFile) : null;

// Test without alert (should pass everything)
if (fs.existsSync(stateFile)) try { fs.unlinkSync(stateFile); } catch(e) {}

ok("disk-space-guard: allows rm -rf when no alert", (function() {
  var r = runGate(dsg, { tool_name: "Bash", tool_input: { command: "rm -rf /tmp/junk" } });
  return r === null;
})());

// Create alert state
try { fs.writeFileSync(stateFile, "test-alert\n"); } catch(e) {}

ok("disk-space-guard: blocks rm -rf during alert", (function() {
  var r = runGate(dsg, { tool_name: "Bash", tool_input: { command: "rm -rf /tmp/junk" } });
  return r && r.decision === "block" && /DISK SPACE GUARD/.test(r.reason);
})());

ok("disk-space-guard: blocks rm -f during alert", (function() {
  var r = runGate(dsg, { tool_name: "Bash", tool_input: { command: "rm -f bigfile.dat" } });
  return r && r.decision === "block";
})());

ok("disk-space-guard: blocks rmdir during alert", (function() {
  var r = runGate(dsg, { tool_name: "Bash", tool_input: { command: "rmdir /tmp/old" } });
  return r && r.decision === "block";
})());

ok("disk-space-guard: allows ls during alert", (function() {
  var r = runGate(dsg, { tool_name: "Bash", tool_input: { command: "ls -la /tmp" } });
  return r === null;
})());

ok("disk-space-guard: allows non-Bash during alert", (function() {
  var r = runGate(dsg, { tool_name: "Read", tool_input: { file_path: "/tmp/file" } });
  return r === null;
})());

// Restore state
if (stateExisted && stateBackup) {
  try { fs.writeFileSync(stateFile, stateBackup); } catch(e) {}
} else {
  try { if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile); } catch(e) {}
}

// ── blueprint-no-sleep (no-unnecessary-sleep) ───────────────────────
var bns = path.join(modulesDir, "PreToolUse", "blueprint-no-sleep.js");

ok("no-unnecessary-sleep: blocks sleep 5", (function() {
  var r = runGate(bns, { tool_name: "Bash", tool_input: { command: "sleep 5" } });
  return r && r.decision === "block" && /PERFORMANCE/.test(r.reason);
})());

ok("no-unnecessary-sleep: blocks sleep 30", (function() {
  var r = runGate(bns, { tool_name: "Bash", tool_input: { command: "sleep 30" } });
  return r && r.decision === "block";
})());

ok("no-unnecessary-sleep: allows sleep 1", (function() {
  var r = runGate(bns, { tool_name: "Bash", tool_input: { command: "sleep 1" } });
  return r === null;
})());

ok("no-unnecessary-sleep: allows non-sleep commands", (function() {
  var r = runGate(bns, { tool_name: "Bash", tool_input: { command: "echo hello" } });
  return r === null;
})());

ok("no-unnecessary-sleep: ignores non-Bash", (function() {
  var r = runGate(bns, { tool_name: "Edit", tool_input: {} });
  return r === null;
})());

// ── claude-p-pattern ────────────────────────────────────────────────
var cpp = path.join(modulesDir, "PreToolUse", "claude-p-pattern.js");

ok("claude-p-pattern: blocks echo pipe to claude -p", (function() {
  var r = runGate(cpp, { tool_name: "Bash", tool_input: { command: 'echo "hello" | claude -p' } });
  return r && r.decision === "block" && /piping via echo/.test(r.reason);
})());

ok("claude-p-pattern: blocks --no-input flag", (function() {
  var r = runGate(cpp, { tool_name: "Bash", tool_input: { command: 'claude -p --no-input < prompt.txt' } });
  return r && r.decision === "block" && /not a valid flag/.test(r.reason);
})());

ok("claude-p-pattern: allows correct claude -p usage", (function() {
  var r = runGate(cpp, { tool_name: "Bash", tool_input: { command: 'claude -p --dangerously-skip-permissions < promptfile.txt > output.txt 2>&1' } });
  return r === null;
})());

ok("claude-p-pattern: allows non-claude commands", (function() {
  var r = runGate(cpp, { tool_name: "Bash", tool_input: { command: "git status" } });
  return r === null;
})());

ok("claude-p-pattern: blocks ANTHROPIC_API_KEY in Edit", (function() {
  var r = runGate(cpp, { tool_name: "Edit", tool_input: {
    file_path: "/project/script.py",
    new_string: "api_key = os.environ['ANTHROPIC_API_KEY']"
  }});
  return r && r.decision === "block" && /API key/.test(r.reason);
})());

ok("claude-p-pattern: blocks anthropic SDK import", (function() {
  var r = runGate(cpp, { tool_name: "Edit", tool_input: {
    file_path: "/project/analyze.py",
    new_string: "import anthropic\nclient = anthropic.Anthropic()"
  }});
  return r && r.decision === "block" && /SDK/.test(r.reason);
})());

ok("claude-p-pattern: blocks base64 image encoding", (function() {
  var r = runGate(cpp, { tool_name: "Write", tool_input: {
    file_path: "/project/check.py",
    content: "import base64\ndata = base64.b64encode(open('screenshot.png','rb').read())"
  }});
  // This may or may not match the claude-p pattern since it doesn't mention claude
  // The gate only triggers when content matches /claude.*-p|anthropic|ANTHROPIC_API_KEY/
  return r === null; // No mention of claude/anthropic = no trigger
})());

ok("claude-p-pattern: allows claude-api skill files", (function() {
  var r = runGate(cpp, { tool_name: "Edit", tool_input: {
    file_path: "/project/claude-api-wrapper/client.py",
    new_string: "import anthropic\nclient = anthropic.Anthropic()"
  }});
  return r === null;
})());

// ═══════════════════════════════════════════════════════════════════════
// PostToolUse gates
// ═══════════════════════════════════════════════════════════════════════

// ── empty-output-detector ───────────────────────────────────────────
var eod = path.join(modulesDir, "PostToolUse", "empty-output-detector.js");

ok("empty-output-detector: flags empty ls output", (function() {
  var r = runGate(eod, { tool_name: "Bash", tool_input: { command: "ls screenshots/" }, tool_result: "" });
  return r && r.decision === "block" && /EMPTY OUTPUT/.test(r.reason);
})());

ok("empty-output-detector: flags empty curl output", (function() {
  var r = runGate(eod, { tool_name: "Bash", tool_input: { command: "curl http://example.com/api" }, tool_result: "  " });
  return r && r.decision === "block";
})());

ok("empty-output-detector: allows ls with output", (function() {
  var r = runGate(eod, { tool_name: "Bash", tool_input: { command: "ls -la" }, tool_result: "total 42\n-rw-r--r-- 1 user user 100 file.txt" });
  return r === null;
})());

ok("empty-output-detector: allows cp with no output", (function() {
  var r = runGate(eod, { tool_name: "Bash", tool_input: { command: "cp file1 file2" }, tool_result: "" });
  return r === null;
})());

ok("empty-output-detector: allows mkdir with no output", (function() {
  var r = runGate(eod, { tool_name: "Bash", tool_input: { command: "mkdir -p /tmp/dir" }, tool_result: "" });
  return r === null;
})());

ok("empty-output-detector: allows git add with no output", (function() {
  var r = runGate(eod, { tool_name: "Bash", tool_input: { command: "git add ." }, tool_result: "" });
  return r === null;
})());

ok("empty-output-detector: ignores non-Bash", (function() {
  var r = runGate(eod, { tool_name: "Edit", tool_input: {}, tool_result: "" });
  return r === null;
})());

// ── disk-space-detect ───────────────────────────────────────────────
var dsd = path.join(modulesDir, "PostToolUse", "disk-space-detect.js");

// Clean up state file before test
if (fs.existsSync(stateFile)) try { fs.unlinkSync(stateFile); } catch(e) {}

ok("disk-space-detect: detects ENOSPC", (function() {
  var r = runGate(dsd, { tool_name: "Bash", tool_input: { command: "npm install" }, tool_result: "Error: ENOSPC: no space left on device" });
  return r && r.decision === "block" && /DISK SPACE ALERT/.test(r.reason);
})());

ok("disk-space-detect: creates state file on alert", (function() {
  return fs.existsSync(stateFile);
})());

// Clean up for next test
if (fs.existsSync(stateFile)) try { fs.unlinkSync(stateFile); } catch(e) {}

ok("disk-space-detect: detects 'no space left on device'", (function() {
  var r = runGate(dsd, { tool_name: "Bash", tool_input: { command: "docker build ." }, tool_result: "write error: no space left on device" });
  return r && r.decision === "block";
})());

// Clean up
if (fs.existsSync(stateFile)) try { fs.unlinkSync(stateFile); } catch(e) {}

ok("disk-space-detect: ignores normal output", (function() {
  var r = runGate(dsd, { tool_name: "Bash", tool_input: { command: "df -h" }, tool_result: "Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1       50G   30G   20G  60% /" });
  return r === null;
})());

ok("disk-space-detect: clears alert on success", (function() {
  // Create state file manually
  fs.writeFileSync(stateFile, "test");
  runGate(dsd, { tool_name: "Bash", tool_input: { command: "ls" }, tool_result: "file1.txt" });
  return !fs.existsSync(stateFile);
})());

// Restore original state
if (stateExisted && stateBackup) {
  try { fs.writeFileSync(stateFile, stateBackup); } catch(e) {}
} else {
  try { if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile); } catch(e) {}
}

// ── troubleshoot-detector ───────────────────────────────────────────
var tsd = path.join(modulesDir, "PostToolUse", "troubleshoot-detector.js");

// The troubleshoot-detector uses a temp file for state, isolated by ppid.
// We test the logic by sending a sequence of fail-fail-succeed.

ok("troubleshoot-detector: no trigger on first success", (function() {
  delete require.cache[require.resolve(tsd)];
  var r = runGate(tsd, { tool_name: "Bash", tool_input: { command: "ls" }, tool_output: "file.txt" });
  return r === null;
})());

ok("troubleshoot-detector: no trigger on single failure + success", (function() {
  delete require.cache[require.resolve(tsd)];
  var gate = require(tsd);
  // One failure
  gate({ tool_name: "Bash", tool_input: { command: "bad-cmd" }, tool_output: "Exit code 1" });
  // Then success
  var r = gate({ tool_name: "Bash", tool_input: { command: "good-cmd" }, tool_output: "ok" });
  return r === null;
})());

ok("troubleshoot-detector: triggers on fail-fail-succeed", (function() {
  delete require.cache[require.resolve(tsd)];
  var gate = require(tsd);
  // Two failures
  gate({ tool_name: "Bash", tool_input: { command: "attempt-1" }, tool_output: "Exit code 1" });
  gate({ tool_name: "Bash", tool_input: { command: "attempt-2" }, tool_output: "Exit code 127" });
  // Then success
  var r = gate({ tool_name: "Bash", tool_input: { command: "finally-works" }, tool_output: "success output" });
  return r && r.decision === "block" && /TROUBLESHOOTING CYCLE/.test(r.reason);
})());

ok("troubleshoot-detector: cooldown prevents repeat trigger", (function() {
  delete require.cache[require.resolve(tsd)];
  var gate = require(tsd);
  // First cycle
  gate({ tool_name: "Bash", tool_input: { command: "bad1" }, tool_output: "Exit code 1" });
  gate({ tool_name: "Bash", tool_input: { command: "bad2" }, tool_output: "Exit code 1" });
  gate({ tool_name: "Bash", tool_input: { command: "good1" }, tool_output: "ok" }); // triggers
  // Second cycle within cooldown
  gate({ tool_name: "Bash", tool_input: { command: "bad3" }, tool_output: "Exit code 1" });
  gate({ tool_name: "Bash", tool_input: { command: "bad4" }, tool_output: "Exit code 1" });
  var r = gate({ tool_name: "Bash", tool_input: { command: "good2" }, tool_output: "ok" });
  return r === null; // cooldown blocks second trigger
})());

ok("troubleshoot-detector: ignores non-Bash", (function() {
  delete require.cache[require.resolve(tsd)];
  var r = runGate(tsd, { tool_name: "Edit", tool_input: { file_path: "/tmp/f" }, tool_output: "" });
  return r === null;
})());

// ═══════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════

console.log("\n" + pass + "/" + (pass + fail) + " passed" + (fail > 0 ? " (" + fail + " FAILED)" : ""));
process.exit(fail > 0 ? 1 : 0);

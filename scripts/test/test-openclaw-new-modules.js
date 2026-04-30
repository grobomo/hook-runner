#!/usr/bin/env node
// T546: Test new OpenClaw-ported modules match hook-runner originals
// Tests deploy-gate, cwd-drift-detector, messaging-safety-gate, commit-counter-gate
// Run: node scripts/test/test-openclaw-new-modules.js
"use strict";

var path = require("path");
var os = require("os");
var fs = require("fs");
var repoDir = path.resolve(__dirname, "../..");
var pass = 0, fail = 0;

// Dynamic test paths (avoids hardcoded-path gate)
var FAKE_ROOT = path.join(os.tmpdir(), "cwd-drift-test-projects");
var PROJ_A = path.join(FAKE_ROOT, "project-a");
var PROJ_B = path.join(FAKE_ROOT, "project-b");

function ok(desc) { pass++; console.log("OK: " + desc); }
function ng(desc) { fail++; console.log("FAIL: " + desc); }
function test(desc, fn) {
  try { fn(); } catch(e) { ng(desc + " (threw: " + e.message + ")"); }
}

// ── deploy-gate ────────────────────────────────────────────────────────
var deployGate = require(path.join(repoDir, "modules/PreToolUse/deploy-gate.js"));

test("deploy-gate: non-deploy command passes", function() {
  var r = deployGate({ tool_name: "Bash", tool_input: { command: "ls -la" } });
  if (r === null) ok("deploy-gate: non-deploy command passes");
  else ng("deploy-gate: non-deploy command should pass");
});

test("deploy-gate: ignores non-Bash", function() {
  var r = deployGate({ tool_name: "Read", tool_input: { file_path: "/tmp/foo" } });
  if (r === null) ok("deploy-gate: Read tool passes");
  else ng("deploy-gate: Read should pass");
});

test("deploy-gate: kubectl apply handled", function() {
  deployGate({ tool_name: "Bash", tool_input: { command: "kubectl apply -f deploy.yaml" } });
  ok("deploy-gate: kubectl apply handled without crash");
});

test("deploy-gate: docker push handled", function() {
  deployGate({ tool_name: "Bash", tool_input: { command: "docker push myimage:latest" } });
  ok("deploy-gate: docker push handled without crash");
});

test("deploy-gate: scp handled", function() {
  deployGate({ tool_name: "Bash", tool_input: { command: "scp build.zip user@host:/deploy/" } });
  ok("deploy-gate: scp handled without crash");
});

test("deploy-gate: aws s3 cp handled", function() {
  deployGate({ tool_name: "Bash", tool_input: { command: "aws s3 cp dist/ s3://bucket/" } });
  ok("deploy-gate: aws s3 cp handled without crash");
});

// ── messaging-safety-gate ──────────────────────────────────────────────
var msgGate = require(path.join(repoDir, "modules/PreToolUse/messaging-safety-gate.js"));

test("messaging-safety: blocks teams send", function() {
  var r = msgGate({ tool_name: "Bash", tool_input: { command: "python teams_chat.py send --chat-id new-chat 'hello'" } });
  if (r && r.decision === "block") ok("messaging-safety: blocks teams send");
  else ng("messaging-safety: should block teams send");
});

test("messaging-safety: blocks graph sendMail", function() {
  var r = msgGate({ tool_name: "Bash", tool_input: { command: "python graph_post.py /sendMail --to user@example.com" } });
  if (r && r.decision === "block") ok("messaging-safety: blocks graph sendMail");
  else ng("messaging-safety: should block graph sendMail");
});

test("messaging-safety: blocks smtp send", function() {
  var r = msgGate({ tool_name: "Bash", tool_input: { command: "python smtp_relay.py send --to user@example.com" } });
  if (r && r.decision === "block") ok("messaging-safety: blocks smtp send");
  else ng("messaging-safety: should block smtp send");
});

test("messaging-safety: allows non-messaging Bash", function() {
  var r = msgGate({ tool_name: "Bash", tool_input: { command: "git status" } });
  if (r === null) ok("messaging-safety: allows non-messaging");
  else ng("messaging-safety: should allow git status");
});

test("messaging-safety: allows non-Bash", function() {
  var r = msgGate({ tool_name: "Read", tool_input: { file_path: "/tmp/foo" } });
  if (r === null) ok("messaging-safety: allows Read tool");
  else ng("messaging-safety: should allow Read");
});

test("messaging-safety: allows authorized chat", function() {
  var r = msgGate({ tool_name: "Bash", tool_input: {
    command: "python teams_chat.py send --chat-id 19:cf504fc638964747bff028e4ba785869@thread.v2 'hello'"
  } });
  if (r === null) ok("messaging-safety: allows authorized chat");
  else ng("messaging-safety: should allow authorized chat");
});

test("messaging-safety: blocks schedule create", function() {
  var r = msgGate({ tool_name: "Bash", tool_input: { command: "python schedule.py create --subject 'Meeting'" } });
  if (r && r.decision === "block") ok("messaging-safety: blocks schedule create");
  else ng("messaging-safety: should block schedule create");
});

// ── cwd-drift-detector ─────────────────────────────────────────────────
var savedProjectDir = process.env.CLAUDE_PROJECT_DIR;
var savedProjectsRoot = process.env.CLAUDE_PROJECTS_ROOT;

function loadCwdGate() {
  delete require.cache[require.resolve(path.join(repoDir, "modules/PreToolUse/cwd-drift-detector.js"))];
  return require(path.join(repoDir, "modules/PreToolUse/cwd-drift-detector.js"));
}

test("cwd-drift: blocks cross-project Edit", function() {
  process.env.CLAUDE_PROJECT_DIR = PROJ_A;
  process.env.CLAUDE_PROJECTS_ROOT = FAKE_ROOT;
  var cwdGate = loadCwdGate();
  var r = cwdGate({ tool_name: "Edit", tool_input: { file_path: path.join(PROJ_B, "src", "main.js") } });
  if (r && r.decision === "block") ok("cwd-drift: blocks Edit in another project");
  else ng("cwd-drift: should block Edit in another project, got " + JSON.stringify(r));
});

test("cwd-drift: allows same-project Edit", function() {
  process.env.CLAUDE_PROJECT_DIR = PROJ_A;
  process.env.CLAUDE_PROJECTS_ROOT = FAKE_ROOT;
  var cwdGate = loadCwdGate();
  var r = cwdGate({ tool_name: "Edit", tool_input: { file_path: path.join(PROJ_A, "src", "main.js") } });
  if (r === null) ok("cwd-drift: allows same-project Edit");
  else ng("cwd-drift: should allow same-project Edit");
});

test("cwd-drift: allows cross-project TODO.md write", function() {
  process.env.CLAUDE_PROJECT_DIR = PROJ_A;
  process.env.CLAUDE_PROJECTS_ROOT = FAKE_ROOT;
  var cwdGate = loadCwdGate();
  var r = cwdGate({ tool_name: "Write", tool_input: { file_path: path.join(PROJ_B, "TODO.md") } });
  if (r === null) ok("cwd-drift: allows cross-project TODO.md");
  else ng("cwd-drift: should allow cross-project TODO.md");
});

test("cwd-drift: blocks cd to another project", function() {
  process.env.CLAUDE_PROJECT_DIR = PROJ_A;
  process.env.CLAUDE_PROJECTS_ROOT = FAKE_ROOT;
  var cwdGate = loadCwdGate();
  var target = PROJ_B.replace(/\\/g, "/");
  var r = cwdGate({ tool_name: "Bash", tool_input: { command: "cd " + target + " && ls" } });
  if (r && r.decision === "block") ok("cwd-drift: blocks cd to another project");
  else ng("cwd-drift: should block cd to another project");
});

test("cwd-drift: allows Read (no file_path extraction)", function() {
  process.env.CLAUDE_PROJECT_DIR = PROJ_A;
  process.env.CLAUDE_PROJECTS_ROOT = FAKE_ROOT;
  var cwdGate = loadCwdGate();
  var r = cwdGate({ tool_name: "Bash", tool_input: { command: "echo hello" } });
  if (r === null) ok("cwd-drift: allows Bash with no project path");
  else ng("cwd-drift: should allow Bash with no project path");
});

// Restore env
if (savedProjectDir !== undefined) process.env.CLAUDE_PROJECT_DIR = savedProjectDir;
else delete process.env.CLAUDE_PROJECT_DIR;
if (savedProjectsRoot !== undefined) process.env.CLAUDE_PROJECTS_ROOT = savedProjectsRoot;
else delete process.env.CLAUDE_PROJECTS_ROOT;

// ── commit-counter-gate ────────────────────────────────────────────────
var origCounterFile = path.join(os.homedir(), ".claude", "hooks", ".uncommitted-edit-count");

function loadCounterGate() {
  try { fs.writeFileSync(origCounterFile, JSON.stringify({ count: 0, ts: Date.now() })); } catch(e) {}
  delete require.cache[require.resolve(path.join(repoDir, "modules/PreToolUse/commit-counter-gate.js"))];
  return require(path.join(repoDir, "modules/PreToolUse/commit-counter-gate.js"));
}

test("commit-counter: Write at count 1 passes", function() {
  var counterGate = loadCounterGate();
  var r = counterGate({ tool_name: "Write", tool_input: { file_path: "/tmp/test.js", content: "x" } });
  if (r === null) ok("commit-counter: Write at count 1 passes");
  else ng("commit-counter: Write at count 1 should pass, got " + JSON.stringify(r));
});

test("commit-counter: git commit resets counter", function() {
  try { fs.writeFileSync(origCounterFile, JSON.stringify({ count: 14, ts: Date.now() })); } catch(e) {}
  var counterGate = loadCounterGate();
  // Force high count
  try { fs.writeFileSync(origCounterFile, JSON.stringify({ count: 14, ts: Date.now() })); } catch(e) {}
  var r = counterGate({ tool_name: "Bash", tool_input: { command: "git commit -m 'test'" } });
  if (r === null) ok("commit-counter: git commit resets counter");
  else ng("commit-counter: git commit should reset, got " + JSON.stringify(r));

  try {
    var state = JSON.parse(fs.readFileSync(origCounterFile, "utf-8"));
    if (state.count === 0) ok("commit-counter: counter is 0 after commit");
    else ng("commit-counter: counter should be 0, got " + state.count);
  } catch(e) { ng("commit-counter: could not read state file"); }
});

test("commit-counter: non-modify Bash passes", function() {
  var counterGate = loadCounterGate();
  var r = counterGate({ tool_name: "Bash", tool_input: { command: "ls -la" } });
  if (r === null) ok("commit-counter: ls passes (not a file modify)");
  else ng("commit-counter: ls should pass");
});

test("commit-counter: Read passes", function() {
  var counterGate = loadCounterGate();
  var r = counterGate({ tool_name: "Read", tool_input: { file_path: "/tmp/foo" } });
  if (r === null) ok("commit-counter: Read passes");
  else ng("commit-counter: Read should pass");
});

// ── push-unpushed ──────────────────────────────────────────────────────
test("push-unpushed: loads and returns null in test mode", function() {
  process.env.HOOK_RUNNER_TEST = "1";
  delete require.cache[require.resolve(path.join(repoDir, "modules/Stop/push-unpushed.js"))];
  var pushGate = require(path.join(repoDir, "modules/Stop/push-unpushed.js"));
  var r = pushGate({ tool_name: "Stop", tool_input: {} });
  if (r === null) ok("push-unpushed: returns null in test mode");
  else ng("push-unpushed: should return null in test mode");
  delete process.env.HOOK_RUNNER_TEST;
});

// ── Summary ────────────────────────────────────────────────────────────
console.log("");
console.log("=== T546 new module tests: " + pass + " passed, " + fail + " failed ===");
if (fail > 0) process.exit(1);

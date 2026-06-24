"use strict";
// Test T840: block-remote-execution-gate

var passed = 0, failed = 0;
function ok(label, condition) {
  if (condition) { passed++; console.log("  PASS: " + label); }
  else { failed++; console.log("  FAIL: " + label); }
}

// Save originals
var origCwd = process.cwd;
var origEnv = Object.assign({}, process.env);

function setDispatcherCwd() {
  process.cwd = function() { return "/tmp/projects/request-tracker"; };
}
function setNonDispatcherCwd() {
  process.cwd = function() { return "/tmp/projects/imsva-upgrade"; };
}
function restore() {
  process.cwd = origCwd;
  process.env = Object.assign({}, origEnv);
}

// Load module in test mode
process.env.HOOK_RUNNER_TEST = "1";
var gate = require("../../modules/PreToolUse/block-remote-execution-gate.js");

console.log("=== block-remote-execution-gate tests ===\n");

console.log("--- Module contract ---");
ok("exports a function", typeof gate === "function");
ok("returns null in test mode", gate({ tool_name: "Bash", tool_input: { command: "ssh root@10.0.0.1" } }) === null);

// Remove test mode for real testing
delete process.env.HOOK_RUNNER_TEST;
// Re-load to get fresh module
delete require.cache[require.resolve("../../modules/PreToolUse/block-remote-execution-gate.js")];
gate = require("../../modules/PreToolUse/block-remote-execution-gate.js");

console.log("\n--- Non-dispatcher project (should always pass) ---");
setNonDispatcherCwd();
ok("ssh passes from non-dispatcher", gate({ tool_name: "Bash", tool_input: { command: "ssh root@10.0.0.92" } }) === null);
ok("scp passes from non-dispatcher", gate({ tool_name: "Bash", tool_input: { command: "scp file.txt root@host:/tmp/" } }) === null);
restore();

console.log("\n--- Non-Bash tools (should always pass) ---");
setDispatcherCwd();
ok("Read tool passes", gate({ tool_name: "Read", tool_input: {} }) === null);
ok("Edit tool passes", gate({ tool_name: "Edit", tool_input: {} }) === null);
ok("Write tool passes", gate({ tool_name: "Write", tool_input: {} }) === null);
ok("Grep tool passes", gate({ tool_name: "Grep", tool_input: {} }) === null);
restore();

console.log("\n--- SSH blocks from dispatcher ---");
setDispatcherCwd();
var r;
r = gate({ tool_name: "Bash", tool_input: { command: "ssh root@10.0.0.92" } });
ok("ssh to IP blocked", r && r.decision === "block");
ok("block mentions remote host", r && r.reason.indexOf("SSH to remote host") >= 0);

r = gate({ tool_name: "Bash", tool_input: { command: "ssh admin@myserver.example.com" } });
ok("ssh to hostname blocked", r && r.decision === "block");

r = gate({ tool_name: "Bash", tool_input: { command: "ssh -p 2222 user@192.168.1.100 'ls /tmp'" } });
ok("ssh with port blocked", r && r.decision === "block");
restore();

console.log("\n--- SCP blocks from dispatcher ---");
setDispatcherCwd();
r = gate({ tool_name: "Bash", tool_input: { command: "scp upgrade.sh root@10.0.0.92:/tmp/" } });
ok("scp to remote blocked", r && r.decision === "block");
ok("block mentions SCP", r && r.reason.indexOf("SCP") >= 0);

r = gate({ tool_name: "Bash", tool_input: { command: "scp -r configs/ root@host:/opt/" } });
ok("scp recursive blocked", r && r.decision === "block");
restore();

console.log("\n--- Rsync blocks from dispatcher ---");
setDispatcherCwd();
r = gate({ tool_name: "Bash", tool_input: { command: "rsync -avz ./data/ user@remote:/backup/" } });
ok("rsync to remote blocked", r && r.decision === "block");
ok("block mentions rsync", r && r.reason.indexOf("rsync") >= 0);
restore();

console.log("\n--- Safe patterns (should pass from dispatcher) ---");
setDispatcherCwd();
ok("curl localhost passes", gate({ tool_name: "Bash", tool_input: { command: "curl http://127.0.0.1:4100/api/fleet" } }) === null);
ok("curl localhost name passes", gate({ tool_name: "Bash", tool_input: { command: "curl http://localhost:4101/api/requests" } }) === null);
ok("ssh localhost passes", gate({ tool_name: "Bash", tool_input: { command: "ssh 127.0.0.1" } }) === null);
ok("ssh localhost name passes", gate({ tool_name: "Bash", tool_input: { command: "ssh localhost" } }) === null);
ok("python manage.py passes", gate({ tool_name: "Bash", tool_input: { command: "python manage.py poll" } }) === null);
ok("python manage.py status passes", gate({ tool_name: "Bash", tool_input: { command: "python manage.py status --json" } }) === null);
ok("gh command passes", gate({ tool_name: "Bash", tool_input: { command: "gh pr list" } }) === null);
ok("git command passes", gate({ tool_name: "Bash", tool_input: { command: "git push origin main" } }) === null);
ok("ls passes", gate({ tool_name: "Bash", tool_input: { command: "ls -la" } }) === null);
ok("echo passes", gate({ tool_name: "Bash", tool_input: { command: "echo hello" } }) === null);
restore();

console.log("\n--- Block message quality ---");
setDispatcherCwd();
r = gate({ tool_name: "Bash", tool_input: { command: "ssh root@10.0.0.92 'apt update'" } });
ok("has BLOCKED:", r && r.reason.indexOf("BLOCKED:") >= 0);
ok("has WHY:", r && r.reason.indexOf("WHY:") >= 0);
ok("has NEXT STEPS:", r && r.reason.indexOf("NEXT STEPS:") >= 0);
ok("has FALSE POSITIVE:", r && r.reason.indexOf("FALSE POSITIVE?") >= 0);
ok("mentions dispatching", r && r.reason.indexOf("dispatch") >= 0);
restore();

console.log("\n--- Empty/missing command ---");
setDispatcherCwd();
ok("empty command passes", gate({ tool_name: "Bash", tool_input: { command: "" } }) === null);
ok("no command passes", gate({ tool_name: "Bash", tool_input: {} }) === null);
ok("no tool_input passes", gate({ tool_name: "Bash" }) === null);
restore();

// Final
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);

#!/usr/bin/env node
"use strict";
// Test suite for windowless-spawn-gate module (T550)
// Tests both JS (original) and Python (new) subprocess pattern detection.

var path = require("path");
var MOD = path.join(__dirname, "../../modules/PreToolUse/windowless-spawn-gate.js");

// The gate checks HOOK_RUNNER_TEST and skips when set.
// The test runner sets HOOK_RUNNER_TEST=1 to bypass live gates.
// Save and clear it so the gate runs normally during tests.
var savedHRT = process.env.HOOK_RUNNER_TEST;
delete process.env.HOOK_RUNNER_TEST;

var pass = 0, fail = 0;
function assert(name, ok) {
  if (ok) { console.log("  PASS: " + name); pass++; }
  else { console.log("  FAIL: " + name); fail++; }
}

var gate = require(MOD);

// Build test paths dynamically to avoid hardcoded-path gate
var HOOKS_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "/tmp", ".claude/hooks");
var MOD_JS = path.join(HOOKS_DIR, "run-modules/test-mod.js");
var MOD_PY = path.join(HOOKS_DIR, "run-modules/helper.py");
var MODULES_PY = path.join(__dirname, "../../modules/PreToolUse/helper.py");
var HOOKS_PY = path.join(HOOKS_DIR, "helper.py");
var NON_HOOK_JS = path.join(process.env.HOME || process.env.USERPROFILE || "/tmp", "project/src/index.js");
var NON_HOOK_PY = path.join(process.env.HOME || process.env.USERPROFILE || "/tmp", "project/src/main.py");
var NON_HOOK_TXT = path.join(HOOKS_DIR, "run-modules/notes.txt");

// Helper to build Write/Edit input for hook module files
function writeJS(content) {
  return { tool_name: "Write", tool_input: { file_path: MOD_JS, content: content } };
}
function editJS(newStr) {
  return { tool_name: "Edit", tool_input: { file_path: MOD_JS, new_string: newStr } };
}
function writePY(content) {
  return { tool_name: "Write", tool_input: { file_path: MOD_PY, content: content } };
}
function editPY(newStr) {
  return { tool_name: "Edit", tool_input: { file_path: MOD_PY, new_string: newStr } };
}

console.log("=== hook-runner: windowless-spawn-gate (T550) ===");

// ---- JS tests (existing behavior) ----
console.log("\n--- JS patterns ---");

// 1. execSync with string blocked
var r1 = gate(writeJS('var out = cp.execSync("git status");'));
assert("JS: execSync with string blocked", r1 && r1.decision === "block");

// 2. execSync with windowsHide passes
var r2 = gate(writeJS('var out = cp.execSync("git status", {windowsHide: true});'));
assert("JS: execSync with windowsHide passes", r2 === null);

// 3. execFileSync passes (safe pattern)
var r3 = gate(writeJS('var out = cp.execFileSync("git", ["status"]);'));
assert("JS: execFileSync passes", r3 === null);

// 4. spawnSync shell:true blocked
var r4 = gate(writeJS('cp.spawnSync("git", [], {shell: true});'));
assert("JS: spawnSync shell:true blocked", r4 && r4.decision === "block");

// 5. spawnSync shell:true with windowsHide passes
var r5 = gate(writeJS('cp.spawnSync("git", [], {shell: true, windowsHide: true});'));
assert("JS: spawnSync shell:true + windowsHide passes", r5 === null);

// 6. spawn shell:true blocked
var r6 = gate(writeJS('cp.spawn("git", [], {shell: true});'));
assert("JS: spawn shell:true blocked", r6 && r6.decision === "block");

// 7. JS comment line skipped
var r7 = gate(writeJS('// cp.execSync("git status");'));
assert("JS: comment line skipped", r7 === null);

// 8. Non-hook file ignored
var r8 = gate({ tool_name: "Write", tool_input: { file_path: NON_HOOK_JS, content: 'cp.execSync("git status");' } });
assert("JS: non-hook file ignored", r8 === null);

// 9. Edit tool also checked
var r9 = gate(editJS('var out = cp.execSync("git log");'));
assert("JS: Edit tool also checked", r9 && r9.decision === "block");

// 10. Non-Write/Edit tool ignored
var r10 = gate({ tool_name: "Bash", tool_input: { command: 'cp.execSync("git status")' } });
assert("JS: Bash tool ignored", r10 === null);

// 11. Block reason mentions JS fix
assert("JS: block reason has content", /BLOCKED|spawn|window/i.test(r1.reason));

// ---- Python tests (new T550 behavior) ----
console.log("\n--- Python patterns ---");

// 12. subprocess.Popen shell=True blocked
var r12 = gate(writePY('p = subprocess.Popen(cmd, shell=True)'));
assert("PY: subprocess.Popen shell=True blocked", r12 && r12.decision === "block");

// 13. subprocess.call shell=True blocked
var r13 = gate(writePY('subprocess.call("git status", shell=True)'));
assert("PY: subprocess.call shell=True blocked", r13 && r13.decision === "block");

// 14. subprocess.run shell=True blocked
var r14 = gate(writePY('subprocess.run("git status", shell=True)'));
assert("PY: subprocess.run shell=True blocked", r14 && r14.decision === "block");

// 15. subprocess.check_call shell=True blocked
var r15 = gate(writePY('subprocess.check_call("git status", shell=True)'));
assert("PY: subprocess.check_call shell=True blocked", r15 && r15.decision === "block");

// 16. subprocess.check_output shell=True blocked
var r16 = gate(writePY('subprocess.check_output("git status", shell=True)'));
assert("PY: subprocess.check_output shell=True blocked", r16 && r16.decision === "block");

// 17. os.system blocked
var r17 = gate(writePY('os.system("git status")'));
assert("PY: os.system blocked", r17 && r17.decision === "block");

// 18. os.popen blocked
var r18 = gate(writePY('os.popen("git status")'));
assert("PY: os.popen blocked", r18 && r18.decision === "block");

// 19. subprocess.Popen with creationflags passes
var r19 = gate(writePY('p = subprocess.Popen(cmd, shell=True, creationflags=subprocess.CREATE_NO_WINDOW)'));
assert("PY: Popen + creationflags passes", r19 === null);

// 20. subprocess.run with CREATE_NO_WINDOW passes
var r20 = gate(writePY('subprocess.run(cmd, shell=True, creationflags=CREATE_NO_WINDOW)'));
assert("PY: run + CREATE_NO_WINDOW passes", r20 === null);

// 21. subprocess.Popen with startupinfo passes
var r21 = gate(writePY('p = subprocess.Popen(cmd, shell=True,\n    startupinfo=si)'));
assert("PY: Popen + startupinfo passes", r21 === null);

// 22. subprocess.run without shell=True passes (no shell, no problem)
var r22 = gate(writePY('subprocess.run(["git", "status"])'));
assert("PY: subprocess.run without shell passes", r22 === null);

// 23. Python comment line skipped
var r23 = gate(writePY('# subprocess.Popen(cmd, shell=True)'));
assert("PY: comment line skipped", r23 === null);

// 24. Non-hook .py file ignored
var r24 = gate({ tool_name: "Write", tool_input: { file_path: NON_HOOK_PY, content: 'os.system("rm -rf /")' } });
assert("PY: non-hook .py file ignored", r24 === null);

// 25. Edit tool on .py also checked
var r25 = gate(editPY('os.system("git pull")'));
assert("PY: Edit on .py file checked", r25 && r25.decision === "block");

// 26. Block reason mentions Python fix
assert("PY: block reason mentions spawn/process", /BLOCKED|spawn|process|window/i.test(r12.reason));

// 27. Block reason has WHY section
assert("PY: block reason has WHY", /WHY:/.test(r12.reason));

// 28. Multiple violations still block
var r28 = gate(writePY('os.system("a")\nos.system("b")\nos.popen("c")'));
assert("PY: multiple violations block", r28 && r28.decision === "block");

// 29. .py in /modules/ path accepted
var r29 = gate({ tool_name: "Write", tool_input: { file_path: MODULES_PY, content: 'os.system("git status")' } });
assert("PY: /modules/ path accepted", r29 && r29.decision === "block");

// 30. .py in /hooks/ path accepted
var r30 = gate({ tool_name: "Write", tool_input: { file_path: HOOKS_PY, content: 'subprocess.Popen("cmd", shell=True)' } });
assert("PY: /hooks/ path accepted", r30 && r30.decision === "block");

// 31. Empty content passes
var r31 = gate({ tool_name: "Write", tool_input: { file_path: MOD_PY, content: "" } });
assert("PY: empty content passes", r31 === null);

// 32. .txt file in hooks dir ignored
var r32 = gate({ tool_name: "Write", tool_input: { file_path: NON_HOOK_TXT, content: 'os.system("bad")' } });
assert("other: .txt file ignored", r32 === null);

// Restore HOOK_RUNNER_TEST
if (savedHRT !== undefined) process.env.HOOK_RUNNER_TEST = savedHRT;

// Summary
console.log("\n" + pass + " passed, " + fail + " failed out of " + (pass + fail));
process.exit(fail > 0 ? 1 : 0);

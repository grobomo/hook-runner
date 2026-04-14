#!/usr/bin/env node
"use strict";
// Test suite for rdp-testbox-gate module (T398)

var path = require("path");
var MOD = path.join(__dirname, "../../modules/PreToolUse/ddei-email-security/rdp-testbox-gate.js");

var pass = 0, fail = 0;
function assert(name, ok) {
  if (ok) { console.log("  PASS: " + name); pass++; }
  else { console.log("  FAIL: " + name); fail++; }
}

var gate = require(MOD);

console.log("=== hook-runner: rdp-testbox-gate (T398) ===");

// 1. Non-Bash tool passes
var r1 = gate({ tool_name: "Write", tool_input: { file_path: "/tmp/rdp.js" } });
assert("non-Bash tool passes", r1 === null);

// 2. git status with rdp filename passes (T396 fix)
var r2 = gate({ tool_name: "Bash", tool_input: { command: "git status rdp-testbox-gate.js" } });
assert("git status rdp-testbox-gate.js passes", r2 === null);

// 3. git add with rdp filename passes
var r3 = gate({ tool_name: "Bash", tool_input: { command: "git add rdp-testbox-gate.js" } });
assert("git add rdp-testbox-gate.js passes", r3 === null);

// 4. git diff with rdp filename passes
var r4 = gate({ tool_name: "Bash", tool_input: { command: "git diff rdp-testbox-gate.js" } });
assert("git diff rdp-testbox-gate.js passes", r4 === null);

// 5. cat with rdp filename passes
var r5 = gate({ tool_name: "Bash", tool_input: { command: "cat rdp-testbox-gate.js" } });
assert("cat rdp-testbox-gate.js passes", r5 === null);

// 6. mstsc command blocked
var r6 = gate({ tool_name: "Bash", tool_input: { command: "mstsc /v:10.0.0.1" } });
assert("mstsc blocked", r6 && r6.decision === "block");

// 7. cmdkey command blocked
var r7 = gate({ tool_name: "Bash", tool_input: { command: "cmdkey /generic:TERMSRV/10.0.0.1" } });
assert("cmdkey blocked", r7 && r7.decision === "block");

// 8. powershell with mstsc blocked
var r8 = gate({ tool_name: "Bash", tool_input: { command: 'powershell -Command "Start-Process mstsc /v:10.0.0.1"' } });
assert("powershell mstsc blocked", r8 && r8.decision === "block");

// 9. joel-scripts allowed
var r9 = gate({ tool_name: "Bash", tool_input: { command: "joel-scripts/testbox-rdp.sh start" } });
assert("joel-scripts allowed", r9 === null);

// 10. testbox-create blocked
var r10 = gate({ tool_name: "Bash", tool_input: { command: "testbox-create --name test" } });
assert("testbox-create blocked", r10 && r10.decision === "block");

// 11. testbox-destroy blocked
var r11 = gate({ tool_name: "Bash", tool_input: { command: "testbox-destroy --name test" } });
assert("testbox-destroy blocked", r11 && r11.decision === "block");

// 12. Block message mentions proven pattern
assert("block mentions proven pattern", r6.reason.indexOf("PROVEN RDP PATTERN") !== -1);

// 13. Block message mentions two servers
assert("block mentions ddei-testbox", r6.reason.indexOf("ddei-testbox") !== -1);
assert("block mentions ddei-tester", r6.reason.indexOf("ddei-tester") !== -1);

// 14. Normal bash command passes
var r14 = gate({ tool_name: "Bash", tool_input: { command: "echo hello world" } });
assert("normal bash passes", r14 === null);

// T442: gh_auto push with rdp in PR body/filenames passes
var r15 = gate({ tool_name: "Bash", tool_input: { command: 'gh_auto push -u origin fix-rdp-testbox-gate' } });
assert("gh_auto push with rdp branch name passes", r15 === null);

// T442: gh pr create with rdp in body passes
var r16 = gate({ tool_name: "Bash", tool_input: { command: 'gh pr create --title "Fix rdp-testbox-gate" --body "Fixed rdp false positive"' } });
assert("gh pr create with rdp in body passes", r16 === null);

console.log("\n" + pass + "/" + (pass + fail) + " passed");
process.exit(fail > 0 ? 1 : 0);

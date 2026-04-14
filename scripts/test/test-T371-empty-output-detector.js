#!/usr/bin/env node
"use strict";
// Test suite for empty-output-detector module (T371)

var path = require("path");
var MOD = path.join(__dirname, "../../modules/PostToolUse/empty-output-detector.js");

var pass = 0, fail = 0;
function assert(name, ok) {
  if (ok) { console.log("  PASS: " + name); pass++; }
  else { console.log("  FAIL: " + name); fail++; }
}

var gate = require(MOD);

console.log("=== hook-runner: empty-output-detector (T371) ===");

// 1. Non-Bash passes
assert("non-Bash passes", gate({ tool_name: "Edit", tool_input: {} }) === null);

// 2. Bash with output passes
assert("bash with output passes", gate({ tool_name: "Bash", tool_input: { command: "ls ." }, tool_result: "file1.js\nfile2.js" }) === null);

// 3. ls with empty output blocks
var r3 = gate({ tool_name: "Bash", tool_input: { command: "ls screenshots/" }, tool_result: "" });
assert("ls empty blocks", r3 && r3.decision === "block");

// 4. cat with empty output blocks
var r4 = gate({ tool_name: "Bash", tool_input: { command: "cat config.json" }, tool_result: "" });
assert("cat empty blocks", r4 && r4.decision === "block");

// 5. find with empty output blocks
var r5 = gate({ tool_name: "Bash", tool_input: { command: "find . -name '*.test.js'" }, tool_result: "" });
assert("find empty blocks", r5 && r5.decision === "block");

// 6. cp with empty output passes (empty is normal)
assert("cp empty passes", gate({ tool_name: "Bash", tool_input: { command: "cp a.js b.js" }, tool_result: "" }) === null);

// 7. mkdir with empty output passes
assert("mkdir empty passes", gate({ tool_name: "Bash", tool_input: { command: "mkdir -p dist/" }, tool_result: "" }) === null);

// 8. git add with empty output passes
assert("git add empty passes", gate({ tool_name: "Bash", tool_input: { command: "git add ." }, tool_result: "" }) === null);

// 9. curl with empty output blocks
var r9 = gate({ tool_name: "Bash", tool_input: { command: "curl http://localhost:8080/health" }, tool_result: "" });
assert("curl empty blocks", r9 && r9.decision === "block");

// 10. kubectl get with empty output blocks
var r10 = gate({ tool_name: "Bash", tool_input: { command: "kubectl get pods -n test" }, tool_result: "" });
assert("kubectl get empty blocks", r10 && r10.decision === "block");

// 11. echo (not in expect-output list) passes even when empty
assert("echo empty passes", gate({ tool_name: "Bash", tool_input: { command: "echo" }, tool_result: "" }) === null);

// 12. Block message mentions investigation
assert("block mentions investigate", r3.reason.indexOf("Investigate") !== -1);

// 13. Whitespace-only output treated as empty
var r13 = gate({ tool_name: "Bash", tool_input: { command: "ls empty-dir/" }, tool_result: "   \n  " });
assert("whitespace-only treated as empty", r13 && r13.decision === "block");

// 14. node setup.js --test with empty blocks
var r14 = gate({ tool_name: "Bash", tool_input: { command: "node setup.js --health" }, tool_result: "" });
assert("node setup.js --health empty blocks", r14 && r14.decision === "block");

// 15. az command with empty blocks
var r15 = gate({ tool_name: "Bash", tool_input: { command: "az vm list" }, tool_result: "" });
assert("az command empty blocks", r15 && r15.decision === "block");

console.log("\n" + pass + "/" + (pass + fail) + " passed");
process.exit(fail > 0 ? 1 : 0);

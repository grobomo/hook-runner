// T475: Cross-validate hook-runner originals produce the same block/allow as OpenClaw plugin
// Run: node scripts/test/e2e-cross-validate.js
"use strict";

var path = require("path");
var repoDir = path.resolve(__dirname, "../..");
var forcePushGate = require(path.join(repoDir, "modules/PreToolUse/force-push-gate.js"));
var commitQualityGate = require(path.join(repoDir, "modules/PreToolUse/commit-quality-gate.js"));

var cases = [
  { desc: "force-push main", input: { tool_name: "Bash", tool_input: { command: "git push --force origin main" } }, expect: "block" },
  { desc: "force-push master", input: { tool_name: "Bash", tool_input: { command: "git push -f origin master" } }, expect: "block" },
  { desc: "force-push feature", input: { tool_name: "Bash", tool_input: { command: "git push --force origin feat" } }, expect: "pass" },
  { desc: "regular push main", input: { tool_name: "Bash", tool_input: { command: "git push origin main" } }, expect: "pass" },
  { desc: "force-with-lease main", input: { tool_name: "Bash", tool_input: { command: "git push --force-with-lease origin main" } }, expect: "block" },
  { desc: "short commit msg", input: { tool_name: "Bash", tool_input: { command: "git commit -m 'fix bug'" } }, expect: "block" },
  { desc: "generic commit msg", input: { tool_name: "Bash", tool_input: { command: "git commit -m 'update the config file for deploy setup'" } }, expect: "block" },
  { desc: "good commit msg", input: { tool_name: "Bash", tool_input: { command: "git commit -m 'Fix spec-gate cache invalidation when tasks.md edited externally'" } }, expect: "pass" },
  { desc: "amend commit", input: { tool_name: "Bash", tool_input: { command: "git commit --amend -m 'wip'" } }, expect: "pass" },
  { desc: "non-git command", input: { tool_name: "Bash", tool_input: { command: "ls -la" } }, expect: "pass" },
  { desc: "Read tool", input: { tool_name: "Read", tool_input: { file_path: "/etc/passwd" } }, expect: "pass" },
];

var pass = 0, fail = 0;
cases.forEach(function(tc) {
  var gates = [forcePushGate, commitQualityGate];
  var blocked = false;
  for (var i = 0; i < gates.length; i++) {
    var result = gates[i](tc.input);
    if (result && result.decision === "block") { blocked = true; break; }
  }
  var actual = blocked ? "block" : "pass";
  if (actual === tc.expect) {
    console.log("OK: hook-runner " + tc.desc + " = " + actual);
    pass++;
  } else {
    console.log("FAIL: hook-runner " + tc.desc + " expected " + tc.expect + " got " + actual);
    fail++;
  }
});

console.log("");
console.log("--- hook-runner cross-validation: " + pass + "/" + (pass + fail) + " passed ---");
if (fail > 0) process.exit(1);

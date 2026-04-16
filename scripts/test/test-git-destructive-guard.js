#!/usr/bin/env node
"use strict";
// T386: Test git-destructive-guard with real and false-positive cases
var guard = require("../../modules/PreToolUse/git-destructive-guard.js");

function test(cmd, expect, label) {
  var result = guard({tool_name: "Bash", tool_input: {command: cmd}});
  var got = result && result.decision === "block" ? "block" : "pass";
  var ok = got === expect;
  console.log((ok ? "OK" : "FAIL") + ": " + label + " -> " + got + " (expected " + expect + ")");
  return ok;
}

var pass = 0, fail = 0;
function run(cmd, expect, label) {
  if (test(cmd, expect, label)) pass++; else fail++;
}

// Real destructive commands — should block
run("git checkout run-stop.js", "block", "single file checkout");
run("git checkout .", "block", "blanket checkout");
run("git restore src/main.js", "block", "restore file");
run("git checkout -- file.js", "block", "checkout -- file");
run("git reset --hard", "block", "reset hard");
run("git clean -fd", "block", "clean force");
// T460: git branch -D no longer blocked (Claude's instructions already require user approval)
run("git branch -D old-branch", "pass", "branch force delete (user-gated)");

// Non-destructive — should pass
run("git checkout -b new-branch", "pass", "new branch");
run("git checkout main", "pass", "switch branch");
run("git checkout feature-branch", "pass", "switch feature");
run("git status", "pass", "status");
// T460: chained commands — checkout branch + other commands should pass
run("git checkout main && git pull origin main 2>&1 | tail -5", "pass", "checkout main chained with pull");
run("git checkout main && GH_TOKEN=$(gh auth token --user grobomo 2>/dev/null) git pull origin main", "pass", "checkout main chained with env var pull");

// False positives: git commands mentioned in strings/heredocs — should pass
run('gh pr create --body "$(cat <<\'EOF\'\ngit checkout file.js is blocked\nEOF\n)"', "pass", "heredoc mention");
run('echo "use git checkout file.js to revert"', "pass", "double-quoted mention");
run("echo 'git checkout . discards changes'", "pass", "single-quoted mention");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

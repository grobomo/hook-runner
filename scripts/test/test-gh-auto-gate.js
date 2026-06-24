#!/usr/bin/env node
/**
 * Test suite for gh-auto-gate PreToolUse module.
 * Ensures raw gh/git remote commands are blocked in favor of gh_auto.
 */
"use strict";

var path = require("path");

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

var modulePath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "gh-auto-gate.js");

function runGate(command) {
  delete require.cache[require.resolve(modulePath)];
  var gate = require(modulePath);
  return gate({ tool_name: "Bash", tool_input: { command: command } });
}

function blocks(command) {
  var result = runGate(command);
  return result && result.decision === "block";
}

function passes(command) {
  return runGate(command) === null;
}

// === Raw gh commands should be blocked ===
ok("gh pr list: blocked", blocks("gh pr list"));
ok("gh pr create: blocked", blocks("gh pr create --title test"));
ok("gh issue list: blocked", blocks("gh issue list"));
ok("gh pr merge: blocked", blocks("gh pr merge 123 --squash"));
ok("gh pr view: blocked", blocks("gh pr view 42"));
ok("gh release create: blocked", blocks("gh release create v1.0"));
ok("gh repo view: blocked", blocks("gh repo view"));

// === Raw git remote commands should be blocked ===
ok("git push: blocked", blocks("git push origin main"));
ok("git pull: blocked", blocks("git pull --rebase"));
ok("git fetch: blocked", blocks("git fetch origin"));
ok("git ls-remote: blocked", blocks("git ls-remote origin"));
ok("git push with flags: blocked", blocks("git push -u origin feature"));

// === gh_auto equivalents should pass ===
ok("gh_auto pr list: pass", passes("gh_auto pr list"));
ok("gh_auto push: pass", passes("gh_auto push origin main"));
ok("gh_auto pull: pass", passes("gh_auto pull --rebase"));
ok("gh_auto fetch: pass", passes("bash ~/bin/gh_auto fetch origin"));

// === GH_TOKEN explicit should pass ===
ok("GH_TOKEN= gh pr list: pass", passes("GH_TOKEN=ghp_abc gh pr list"));
ok("GH_TOKEN= git push: pass", passes("GH_TOKEN=ghp_abc git push origin main"));

// === gh auth commands should pass (needed for token management) ===
ok("gh auth switch: pass", passes("gh auth switch --user grobomo"));
ok("gh auth status: pass", passes("gh auth status"));
ok("gh auth login: pass", passes("gh auth login"));

// === gh api user (diagnostic) should pass ===
ok("gh api user: pass", passes("gh api user"));

// === Non-GitHub commands should pass ===
ok("non-Bash tool: pass", function() {
  delete require.cache[require.resolve(modulePath)];
  var gate = require(modulePath);
  return gate({ tool_name: "Read", tool_input: { file_path: "/tmp/test" } }) === null;
}());
ok("git status: pass", passes("git status"));
ok("git log: pass", passes("git log --oneline -5"));
ok("git diff: pass", passes("git diff HEAD"));
ok("git add: pass", passes("git add file.js"));
ok("git commit: pass", passes("git commit -m 'test'"));
ok("git branch: pass", passes("git branch -a"));
ok("ls: pass", passes("ls -la"));
ok("npm test: pass", passes("npm test"));

// === Block message quality ===
ok("block message has suggestion", function() {
  var result = runGate("gh pr list");
  return result && result.reason.indexOf("gh_auto") !== -1;
}());
ok("git push block has WHY", function() {
  var result = runGate("git push origin main");
  return result && /WHY:/.test(result.reason);
}());
ok("gh pr create block has NEXT STEPS", function() {
  var result = runGate("gh pr create --title test");
  return result && /NEXT STEPS:/i.test(result.reason);
}());

// === Edge cases ===
ok("gh in middle of command: pass", passes("echo 'run gh pr list' > log.txt"));
ok("leading whitespace gh: blocked", blocks("  gh pr list"));
// Note: chained commands (cd && gh) bypass the ^gh regex — acceptable tradeoff
// vs complex multi-command parsing. Claude rarely chains like this.
ok("cd && gh: passes (chained, not caught by ^gh)", passes('cd /tmp && gh pr list'));

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

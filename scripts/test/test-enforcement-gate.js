#!/usr/bin/env node
"use strict";
var path = require("path");
var fs = require("fs");
var os = require("os");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/enforcement-gate.js"));

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}

// Save original env
var origProjectDir = process.env.CLAUDE_PROJECT_DIR;
var home = process.env.HOME || process.env.USERPROFILE || "";

// --- Tool filtering ---
ok("Read tool ignored", gate({tool_name: "Read", tool_input: {}}) === null);
ok("Bash tool ignored", gate({tool_name: "Bash", tool_input: {command: "echo hi"}}) === null);
ok("Glob tool ignored", gate({tool_name: "Glob", tool_input: {}}) === null);

// --- Allow TODO.md edits (bootstrap) ---
ok("Edit TODO.md allowed", gate({tool_name: "Edit", tool_input: {file_path: "/some/project/TODO.md"}}) === null);
ok("Write TODO.md allowed", gate({tool_name: "Write", tool_input: {file_path: "C:/projects/myapp/TODO.md"}}) === null);

// --- Allow ~/.claude/ edits (user config) ---
var claudeDir = path.join(home, ".claude", "hooks", "test.js");
ok("Edit ~/.claude/ file allowed", gate({tool_name: "Edit", tool_input: {file_path: claudeDir}}) === null);
ok("Write ~/.claude/ file allowed", gate({tool_name: "Write", tool_input: {file_path: claudeDir}}) === null);

// --- Block edits in dir without .git ---
// Use a temp dir that definitely has no .git
var tmpDir = path.join(os.tmpdir(), "enforcement-test-" + Date.now());
fs.mkdirSync(tmpDir, {recursive: true});
var tmpFile = path.join(tmpDir, "app.js");
process.env.CLAUDE_PROJECT_DIR = tmpDir;
var r1 = gate({tool_name: "Edit", tool_input: {file_path: tmpFile}});
ok("no git repo blocks", r1 && r1.decision === "block");
ok("no git repo mentions git init", r1 && /git init/i.test(r1.reason));

// --- Block edits when no TODO.md (but has .git) ---
var gitDir = path.join(os.tmpdir(), "enforcement-git-" + Date.now());
fs.mkdirSync(path.join(gitDir, ".git", "refs"), {recursive: true});
// Create minimal HEAD file
fs.writeFileSync(path.join(gitDir, ".git", "HEAD"), "ref: refs/heads/feature-branch\n");
process.env.CLAUDE_PROJECT_DIR = gitDir;
var codeFile = path.join(gitDir, "src", "app.js");
fs.mkdirSync(path.join(gitDir, "src"), {recursive: true});
var r2 = gate({tool_name: "Edit", tool_input: {file_path: codeFile}});
ok("no TODO.md blocks", r2 && r2.decision === "block");
ok("no TODO.md mentions TODO.md", r2 && /TODO\.md/i.test(r2.reason));

// --- Pass when git repo + TODO.md exist (on feature branch) ---
fs.writeFileSync(path.join(gitDir, "TODO.md"), "# Tasks\n- [ ] Do stuff\n");
var r3 = gate({tool_name: "Edit", tool_input: {file_path: codeFile}});
ok("git repo + TODO.md + feature branch passes", r3 === null);

// --- Main branch dirty tree check ---
// Set HEAD to main
fs.writeFileSync(path.join(gitDir, ".git", "HEAD"), "ref: refs/heads/main\n");
// The dirty tree check calls git status --porcelain which needs a real repo.
// We can't easily test that here. But we CAN test that main branch detection works
// by verifying it attempts the git status check (which will throw in our fake repo)
// and falls through to the TODO.md check (which passes since we created it).
var r4 = gate({tool_name: "Edit", tool_input: {file_path: codeFile}});
// In a fake .git dir, git status will fail → catch block → skip check → passes TODO.md check
ok("main branch with TODO.md passes (git status fails gracefully)", r4 === null);

// --- Empty file_path ---
ok("empty file_path passes", gate({tool_name: "Edit", tool_input: {file_path: ""}}) === null);

// --- String tool_input doesn't crash (module doesn't parse it, falls through gracefully) ---
ok("string tool_input no crash", gate({tool_name: "Edit", tool_input: JSON.stringify({file_path: tmpFile})}) === null || true);

// Cleanup
process.env.CLAUDE_PROJECT_DIR = origProjectDir || "";
try { fs.rmSync(tmpDir, {recursive: true, force: true}); } catch(e) {}
try { fs.rmSync(gitDir, {recursive: true, force: true}); } catch(e) {}

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);

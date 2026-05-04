#!/usr/bin/env node
"use strict";
var path = require("path");
var fs = require("fs");
var os = require("os");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/branch-pr-gate.js"));

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}
function blocks(r) { return r && r.decision === "block"; }

// --- Tool filtering: only Edit, Write, Bash are gated ---
ok("Read tool ignored", gate({tool_name: "Read", tool_input: {}}) === null);
ok("Glob tool ignored", gate({tool_name: "Glob", tool_input: {}}) === null);
ok("Grep tool ignored", gate({tool_name: "Grep", tool_input: {}}) === null);

// --- Edit/Write: allowed file patterns pass on any branch ---
var allowedFiles = [
  "/project/TODO.md",
  "/project/SESSION_STATE.md",
  "/project/CLAUDE.md",
  "/project/README.md",
  "/project/.claude/config.json",
  "/project/specs/001/SPEC.md",
  "/project/.planning/plan.md",
  "/project/.specify/spec.md",
  "/project/.github/workflows/ci.yml",
  "/project/hooks/my-hook.js",
  "/project/rules/my-rule.md",
  "/project/.gitignore",
  "/project/scripts/test/test-foo.js",
  "/project/package.json",
  "/project/config.json",
];
for (var i = 0; i < allowedFiles.length; i++) {
  var f = allowedFiles[i];
  ok("allowed: " + path.basename(f), gate({tool_name: "Edit", tool_input: {file_path: f}, _git: {branch: "main"}}) === null);
}

// --- Edit code file on main → blocks ---
var r1 = gate({tool_name: "Edit", tool_input: {file_path: "/project/src/app.js"}, _git: {branch: "main"}});
ok("Edit code on main blocks", blocks(r1));
ok("main block mentions EnterWorktree", r1 && /EnterWorktree/i.test(r1.reason));

var r2 = gate({tool_name: "Write", tool_input: {file_path: "/project/src/app.js"}, _git: {branch: "main"}});
ok("Write code on main blocks", blocks(r2));

var r3 = gate({tool_name: "Edit", tool_input: {file_path: "/project/src/app.js"}, _git: {branch: "master"}});
ok("Edit code on master blocks", blocks(r3));

// --- Edit code on task branch → passes ---
ok("Edit on task branch passes", gate({tool_name: "Edit", tool_input: {file_path: "/project/src/app.js"}, _git: {branch: "004-T016-fix-auth"}}) === null);
ok("Edit on T-branch passes", gate({tool_name: "Edit", tool_input: {file_path: "/project/src/app.js"}, _git: {branch: "feature/T001"}}) === null);

// --- Edit code on bare feature branch → blocks ---
var r4 = gate({tool_name: "Edit", tool_input: {file_path: "/project/src/app.js"}, _git: {branch: "005-add-feature"}});
ok("Edit on bare feature branch blocks", blocks(r4));
ok("feature branch block mentions task branch", r4 && /task branch/i.test(r4.reason));
// But scripts/ are allowed on bare feature branch
ok("Edit script on feature passes", gate({tool_name: "Edit", tool_input: {file_path: "/project/scripts/deploy.sh"}, _git: {branch: "005-add-feature"}}) === null);

// --- Bash: read-only commands always pass ---
var readOnlyCmds = [
  "git status",
  "git log --oneline",
  "git diff HEAD",
  "git branch -a",
  "git show HEAD",
  "git remote -v",
  "git fetch origin",
  "git stash list",
  "git rev-parse HEAD",
  "git config --get user.name",
  "ls -la",
  "cat README.md",
  "head -5 file.txt",
  "echo hello",
  "grep -r TODO src/",
  "find . -name '*.js'",
  "docker ps",
  "docker images",
  "aws s3 ls s3://bucket/",
  "gh pr list",
  "gh auth status",
  "gh auth switch --user grobomo",
  "node -e 'console.log(1)'",
  "bash scripts/test/test-foo.sh",
  "curl http://localhost:8080",
  "chmod +x script.sh",
  "sleep 5",
  "MSYS_NO_PATHCONV=1 docker exec foo ls",
];
for (var ri = 0; ri < readOnlyCmds.length; ri++) {
  ok("read-only: " + readOnlyCmds[ri].substring(0, 30), gate({tool_name: "Bash", tool_input: {command: readOnlyCmds[ri]}, _git: {branch: "main"}}) === null);
}

// --- Bash: state-changing on main → blocks ---
var r5 = gate({tool_name: "Bash", tool_input: {command: "git commit -m 'test'"}, _git: {branch: "main"}});
ok("git commit on main blocks", blocks(r5));
ok("commit block mentions EnterWorktree", r5 && /EnterWorktree/i.test(r5.reason));

ok("git push on main blocks", blocks(gate({tool_name: "Bash", tool_input: {command: "git push origin main"}, _git: {branch: "main"}})));
ok("git merge on main blocks", blocks(gate({tool_name: "Bash", tool_input: {command: "git merge feature"}, _git: {branch: "main"}})));
ok("docker build on main blocks", blocks(gate({tool_name: "Bash", tool_input: {command: "docker build -t app ."}, _git: {branch: "main"}})));
ok("gh pr create on main blocks", blocks(gate({tool_name: "Bash", tool_input: {command: "gh pr create --title 'test'"}, _git: {branch: "main"}})));

// --- Repair commands allowed on main ---
ok("git reset --hard origin on main passes", gate({tool_name: "Bash", tool_input: {command: "git reset --hard origin/main"}, _git: {branch: "main"}}) === null);
ok("git reset --soft HEAD~ on main passes", gate({tool_name: "Bash", tool_input: {command: "git reset --soft HEAD~1"}, _git: {branch: "main"}}) === null);
ok("git branch -f main origin passes", gate({tool_name: "Bash", tool_input: {command: "git branch -f main origin/main"}, _git: {branch: "main"}}) === null);

// --- Recovery commands allowed on any branch ---
ok("rebase --abort passes", gate({tool_name: "Bash", tool_input: {command: "git rebase --abort"}, _git: {branch: "005-add-feature"}}) === null);
ok("merge --abort passes", gate({tool_name: "Bash", tool_input: {command: "git merge --abort"}, _git: {branch: "005-add-feature"}}) === null);
ok("cherry-pick --abort passes", gate({tool_name: "Bash", tool_input: {command: "git cherry-pick --abort"}, _git: {branch: "005-add-feature"}}) === null);

// --- Bash on task branch → passes ---
ok("git commit on task branch passes", gate({tool_name: "Bash", tool_input: {command: "git commit -m 'fix'"}, _git: {branch: "004-T016-fix-auth"}}) === null);
ok("git push on task branch passes", gate({tool_name: "Bash", tool_input: {command: "git push origin 004-T016-fix-auth"}, _git: {branch: "004-T016-fix-auth"}}) === null);

// --- Bash on bare feature branch: state-changing blocked ---
var r6 = gate({tool_name: "Bash", tool_input: {command: "git commit -m 'test'"}, _git: {branch: "005-add-feature"}});
ok("git commit on feature branch blocks", blocks(r6));

// But push -u is allowed (tracking setup)
ok("git push -u on feature passes", gate({tool_name: "Bash", tool_input: {command: "git push -u origin 005-add-feature"}, _git: {branch: "005-add-feature"}}) === null);
// Branch rename allowed
ok("git branch -m on feature passes", gate({tool_name: "Bash", tool_input: {command: "git branch -m old-name new-name"}, _git: {branch: "005-add-feature"}}) === null);
// Push --delete allowed
ok("git push --delete on feature passes", gate({tool_name: "Bash", tool_input: {command: "git push origin --delete old-branch"}, _git: {branch: "005-add-feature"}}) === null);

// --- Branch name validation ---
// git checkout -b with valid task branch
ok("checkout -b task branch passes", gate({tool_name: "Bash", tool_input: {command: "git checkout -b 004-T016-fix-auth"}, _git: {branch: "main"}}) === null);

// git checkout -b with valid feature branch (verb-noun)
ok("checkout -b feature branch passes", gate({tool_name: "Bash", tool_input: {command: "git checkout -b 005-add-dashboard"}, _git: {branch: "main"}}) === null);

// git checkout -b with invalid name (no spec number)
var r7 = gate({tool_name: "Bash", tool_input: {command: "git checkout -b fix-bug"}, _git: {branch: "main"}});
ok("checkout -b no spec number blocks", blocks(r7));
ok("name error mentions 3-digit", r7 && /3-digit/i.test(r7.reason));

// git checkout -b with "and" in name
var r8 = gate({tool_name: "Bash", tool_input: {command: "git checkout -b 007-scale-and-dashboard"}, _git: {branch: "main"}});
ok("checkout -b with and blocks", blocks(r8));
ok("and error mentions split", r8 && /split/i.test(r8.reason));

// git checkout -b with invalid verb
var r9 = gate({tool_name: "Bash", tool_input: {command: "git checkout -b 007-dashboard-feature"}, _git: {branch: "main"}});
ok("checkout -b invalid verb blocks", blocks(r9));
ok("verb error mentions verb-noun", r9 && /verb-noun/i.test(r9.reason));

// --- Non-state-changing unknown commands pass through ---
ok("npm install passes", gate({tool_name: "Bash", tool_input: {command: "npm install"}, _git: {branch: "main"}}) === null);
ok("node app.js passes", gate({tool_name: "Bash", tool_input: {command: "node app.js"}, _git: {branch: "main"}}) === null);

// --- Empty inputs ---
ok("empty command passes", gate({tool_name: "Bash", tool_input: {command: ""}}) === null);
ok("empty file_path passes", gate({tool_name: "Edit", tool_input: {file_path: ""}}) === null);

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);

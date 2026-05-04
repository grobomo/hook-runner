#!/usr/bin/env node
"use strict";
var path = require("path");
var fs = require("fs");
var os = require("os");

// Must require fresh each time to reset cache
function freshGate() {
  var modPath = path.join(__dirname, "../../modules/PreToolUse/inter-project-priority-gate.js");
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}
function blocks(r) { return r && r.decision === "block"; }

var origProjectDir = process.env.CLAUDE_PROJECT_DIR;

// --- Tool filtering (no project dir needed) ---
var gate = freshGate();
ok("Read tool ignored", gate({tool_name: "Read", tool_input: {}}) === null);
ok("Glob tool ignored", gate({tool_name: "Glob", tool_input: {}}) === null);

// --- No CLAUDE_PROJECT_DIR → passes ---
delete process.env.CLAUDE_PROJECT_DIR;
gate = freshGate();
ok("no project dir passes", gate({tool_name: "Edit", tool_input: {file_path: "/app.js"}}) === null);

// --- Project with no TODO.md → passes ---
var tmpDir = path.join(os.tmpdir(), "ipg-test-" + Date.now());
fs.mkdirSync(tmpDir, {recursive: true});
process.env.CLAUDE_PROJECT_DIR = tmpDir.replace(/\\/g, "/");
gate = freshGate();
ok("no TODO.md passes", gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "app.js")}}) === null);

// --- Project with TODO.md but no XREF items → passes ---
fs.writeFileSync(path.join(tmpDir, "TODO.md"), "# Tasks\n- [ ] Normal task\n- [x] Done task\n");
gate = freshGate();
ok("no XREF items passes", gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "app.js")}}) === null);

// --- Project with checked XREF items → passes ---
fs.writeFileSync(path.join(tmpDir, "TODO.md"),
  "# Tasks\n- [x] Fix thing <!-- XREF:dd-lab:T999 2026-05-01 -->\n");
gate = freshGate();
ok("checked XREF passes", gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "app.js")}}) === null);

// --- Project with unchecked XREF → blocks non-XREF work ---
fs.writeFileSync(path.join(tmpDir, "TODO.md"),
  "# Tasks\n- [ ] Fix thing <!-- XREF:dd-lab:T100 2026-05-01 -->\n");
gate = freshGate();
var r1 = gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "app.js")}});
ok("unchecked XREF blocks Edit", blocks(r1));
ok("block mentions INTER-PROJECT", r1 && /INTER-PROJECT/i.test(r1.reason));
ok("block mentions T100", r1 && /T100/.test(r1.reason));
ok("block mentions dd-lab", r1 && /dd-lab/.test(r1.reason));

// Write tool also blocked
var r2 = gate({tool_name: "Write", tool_input: {file_path: path.join(tmpDir, "app.js")}});
ok("unchecked XREF blocks Write", blocks(r2));

// Bash state-changing also blocked
var r3 = gate({tool_name: "Bash", tool_input: {command: "npm install express"}});
ok("unchecked XREF blocks Bash", blocks(r3));

// --- Allowed: edits to TODO.md itself ---
ok("Edit TODO.md allowed", gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "TODO.md")}}) === null);

// --- Allowed: SESSION_STATE.md ---
ok("Edit SESSION_STATE.md allowed", gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "SESSION_STATE.md")}}) === null);

// --- Allowed: CHANGELOG.md ---
ok("Edit CHANGELOG.md allowed", gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "CHANGELOG.md")}}) === null);

// --- Allowed: spec files ---
ok("Edit spec file allowed", gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "specs", "001", "SPEC.md")}}) === null);

// --- Allowed: .planning files ---
ok("Edit .planning file allowed", gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, ".planning", "plan.md")}}) === null);

// --- Allowed: .claude files ---
ok("Edit .claude file allowed", gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, ".claude", "config.json")}}) === null);

// --- Allowed: test files ---
ok("Edit test file allowed", gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "scripts", "test", "test-foo.js")}}) === null);
ok("Edit .test.js allowed", gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "src", "foo.test.js")}}) === null);

// --- Allowed: read-only Bash commands ---
ok("git status allowed", gate({tool_name: "Bash", tool_input: {command: "git status"}}) === null);
ok("git log allowed", gate({tool_name: "Bash", tool_input: {command: "git log --oneline"}}) === null);
ok("ls allowed", gate({tool_name: "Bash", tool_input: {command: "ls -la"}}) === null);
ok("cat allowed", gate({tool_name: "Bash", tool_input: {command: "cat README.md"}}) === null);
ok("grep allowed", gate({tool_name: "Bash", tool_input: {command: "grep -r TODO src/"}}) === null);
ok("gh pr list allowed", gate({tool_name: "Bash", tool_input: {command: "gh pr list"}}) === null);
ok("node setup.js allowed", gate({tool_name: "Bash", tool_input: {command: "node setup.js --test"}}) === null);
ok("bash scripts/test allowed", gate({tool_name: "Bash", tool_input: {command: "bash scripts/test/test-foo.sh"}}) === null);
ok("cd + git allowed", gate({tool_name: "Bash", tool_input: {command: "cd /some/dir && git log"}}) === null);
ok("env prefix + echo allowed", gate({tool_name: "Bash", tool_input: {command: "FOO=bar echo test"}}) === null);

// --- Allowed: branch matches XREF task ID ---
var r4 = gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "app.js")}, _git: {branch: "fix-T100-bug"}});
ok("branch matching XREF task allowed", r4 === null);

// --- Multiple XREF items ---
fs.writeFileSync(path.join(tmpDir, "TODO.md"),
  "# Tasks\n- [ ] Fix A <!-- XREF:proj1:T200 2026-05-01 -->\n- [ ] Fix B <!-- XREF:proj2:T300 2026-05-02 -->\n");
gate = freshGate();
var r5 = gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "app.js")}});
ok("multiple XREFs block", blocks(r5));
ok("multiple XREFs mention count", r5 && /2 P0 item/.test(r5.reason));

// --- Inbound Requests section ---
fs.writeFileSync(path.join(tmpDir, "TODO.md"),
  "# Tasks\n- [x] done\n\n## Inbound Requests\n- [ ] Fix the login page\n");
gate = freshGate();
var r6 = gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "app.js")}});
ok("Inbound Requests section blocks", blocks(r6));

// Cleanup
process.env.CLAUDE_PROJECT_DIR = origProjectDir || "";
try { fs.rmSync(tmpDir, {recursive: true, force: true}); } catch(e) {}

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);

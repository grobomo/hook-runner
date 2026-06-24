// Test worktree-scope-guard-gate (T661)
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log("  PASS: " + msg); }
  else { failed++; console.log("  FAIL: " + msg); }
}

// Setup temp project dir with TODO.md
var tmpDir = path.join(os.tmpdir(), "t661-test-" + Date.now(), "my-project");
fs.mkdirSync(tmpDir, { recursive: true });
fs.writeFileSync(path.join(tmpDir, "TODO.md"), "# TODO\n- [ ] T100: Fix auth module\n- [ ] T200: Add webhook handler\n");

// Override env
var origProject = process.env.CLAUDE_PROJECT_DIR;
process.env.CLAUDE_PROJECT_DIR = tmpDir;

var modPath = path.join(__dirname, "../../modules/PreToolUse/worktree-scope-guard-gate.js");
delete require.cache[require.resolve(modPath)];
var gate = require(modPath);

function makeInput(name) {
  return { tool_name: "EnterWorktree", tool_input: { name: name } };
}

console.log("\n=== worktree-scope-guard-gate tests ===\n");

console.log("--- Module contract ---");
ok(typeof gate === "function", "exports a function");

console.log("--- Non-worktree tools ---");
ok(gate({ tool_name: "Bash", tool_input: {} }) === null, "ignores Bash tool");
ok(gate({ tool_name: "Edit", tool_input: {} }) === null, "ignores Edit tool");

console.log("--- No name (auto-generated) ---");
ok(gate({ tool_name: "EnterWorktree", tool_input: {} }) === null, "passes with no name");
ok(gate({ tool_name: "EnterWorktree", tool_input: { name: "" } }) === null, "passes with empty name");

console.log("--- Name contains project name ---");
ok(gate(makeInput("my-project-fix")) === null, "passes when name contains project name");

console.log("--- Name matches TODO content ---");
ok(gate(makeInput("auth-module-fix")) === null, "passes when name word matches TODO");
ok(gate(makeInput("webhook-handler")) === null, "passes when name word matches TODO");
ok(gate(makeInput("t100-auth-fix")) === null, "passes when task ID matches TODO");
ok(gate(makeInput("t200-webhook")) === null, "passes when task ID t200 matches TODO");

console.log("--- Unrelated name blocked ---");
var r = gate(makeInput("ad-exchange-spec"));
ok(r !== null && r.decision === "block", "blocks unrelated worktree name");
ok(r && /outside.*scope/i.test(r.reason), "block message mentions scope");
ok(r && /FALSE POSITIVE/.test(r.reason), "block has FALSE POSITIVE escape");

var r2 = gate(makeInput("random-feature-xyz"));
ok(r2 !== null && r2.decision === "block", "blocks another unrelated name");

console.log("--- Short words ignored ---");
// Words < 3 chars shouldn't match
fs.writeFileSync(path.join(tmpDir, "TODO.md"), "# TODO\n- [ ] Fix it\n");
delete require.cache[require.resolve(modPath)];
gate = require(modPath);
var r3 = gate(makeInput("it-is-broken"));
ok(r3 !== null && r3.decision === "block", "short words (it, is) don't count as matches");

// Cleanup
process.env.CLAUDE_PROJECT_DIR = origProject || "";
try { fs.rmSync(path.dirname(tmpDir), { recursive: true }); } catch (e) {}

console.log("\n    " + passed + " passed, " + failed + " failed\n");
process.exit(failed > 0 ? 1 : 0);

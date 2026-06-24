#!/usr/bin/env node
"use strict";
var path = require("path");
var os = require("os");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/no-native-memory-gate.js"));

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}

var HOME = os.homedir().replace(/\\/g, "/");

function blocks(tool, filePath) {
  var r = gate({tool_name: tool, tool_input: {file_path: filePath}});
  return r && r.decision === "block";
}
function passes(tool, filePath) {
  return gate({tool_name: tool, tool_input: {file_path: filePath}}) === null;
}

// Non-edit tools ignored
ok("Read ignored", passes("Read", HOME + "/.claude/rules/test.md"));

// Global rules blocked
ok("Write to global rules blocked", blocks("Write", HOME + "/.claude/rules/test.md"));
ok("Edit global rules blocked", blocks("Edit", HOME + "/.claude/rules/enforce.md"));

// Project rules blocked
ok("Write .claude/rules blocked", blocks("Write", "/project/.claude/rules/gate.md"));
ok("Edit .claude/rules blocked", blocks("Edit", "/project/.claude/rules/enforce.md"));
ok("Windows path .claude\\rules blocked", blocks("Write", "C:\\project\\.claude\\rules\\gate.md"));

// Non-rules .claude paths allowed
ok(".claude/settings.json passes", passes("Write", HOME + "/.claude/settings.json"));
ok(".claude/hooks passes", passes("Edit", HOME + "/.claude/hooks/run-pretooluse.js"));

// Other paths with 'rules' in name allowed
ok("src/rules.js passes", passes("Write", "/project/src/rules.js"));
ok("docs/rules/ passes", passes("Edit", "/project/docs/rules/readme.md"));

// Empty path passes
ok("empty path passes", passes("Write", ""));

// Block message quality
var r = gate({tool_name: "Write", tool_input: {file_path: HOME + "/.claude/rules/test.md"}});
ok("block mentions rules/enforcement", r && /BLOCKED|rules|enforcement|hook/i.test(r.reason));
ok("block has WHY section", r && /WHY:/.test(r.reason));

// === T732: Bash file mutation tests ===
function bashBlocks(cmd) {
  var r2 = gate({tool_name: "Bash", tool_input: {command: cmd}});
  return r2 && r2.decision === "block";
}
function bashPasses(cmd) {
  return gate({tool_name: "Bash", tool_input: {command: cmd}}) === null;
}

// Bash writes to global rules → block
ok("Bash: echo to global rules blocked", bashBlocks('echo "rule content" > ' + HOME + '/.claude/rules/test.md'));
ok("Bash: tee to global rules blocked", bashBlocks('tee ' + HOME + '/.claude/rules/enforce.md'));
ok("Bash: cat heredoc to global rules blocked", bashBlocks("cat > " + HOME + "/.claude/rules/new.md <<'EOF'\nrule text\nEOF"));

// Bash writes to project rules → block
ok("Bash: echo to project rules blocked", bashBlocks('echo "content" > /project/.claude/rules/gate.md'));
ok("Bash: cp to project rules blocked", bashBlocks('cp /tmp/rule.md /project/.claude/rules/enforce.md'));

// Bash writes to non-rules paths → pass
ok("Bash: echo to normal file passes", bashPasses('echo "hello" > /tmp/test.txt'));
ok("Bash: tee to hooks passes", bashPasses("tee " + HOME + "/.claude/hooks/test.js"));
ok("Bash: read-only command passes", bashPasses("cat " + HOME + "/.claude/rules/test.md"));
ok("Bash: empty command passes", bashPasses(""));
ok("Bash: ls passes", bashPasses("ls " + HOME + "/.claude/rules/"));

// Bash block message quality
var br = gate({tool_name: "Bash", tool_input: {command: 'echo "x" > ' + HOME + '/.claude/rules/test.md'}});
ok("Bash block has BLOCKED format", br && /BLOCKED/.test(br.reason));
ok("Bash block has WHY + NEXT STEPS", br && /WHY:/.test(br.reason) && /NEXT STEPS:/i.test(br.reason));

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);

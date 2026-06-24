#!/usr/bin/env node
"use strict";
var path = require("path");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/no-hardcoded-paths.js"));

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}

// Build test paths dynamically to avoid triggering the gate on THIS file
var WIN_PATH = ["C:", "Users", "joel", "Documents", "file.txt"].join("\\");
var WIN_FWD = ["C:", "Users", "joel", "project"].join("/");
var LINUX_PATH = ["", "home", "ubuntu", "data", "file.csv"].join("/");
var MAC_PATH = ["", "Users", "joel", "Documents", "file.txt"].join("/");

function writeBlocks(filePath, content) {
  var r = gate({tool_name: "Write", tool_input: {file_path: filePath, content: content}});
  return r && r.decision === "block";
}
function editBlocks(filePath, newStr) {
  var r = gate({tool_name: "Edit", tool_input: {file_path: filePath, new_string: newStr}});
  return r && r.decision === "block";
}
function writePasses(filePath, content) {
  return gate({tool_name: "Write", tool_input: {file_path: filePath, content: content}}) === null;
}

// Non-edit tools ignored
ok("Read tool ignored", gate({tool_name: "Read", tool_input: {}}) === null);
ok("Bash empty command passes", gate({tool_name: "Bash", tool_input: {}}) === null);

// Windows paths blocked
ok("Write: Windows path blocked", writeBlocks("/tmp/app.js", 'var p = "' + WIN_PATH + '";'));
ok("Edit: Windows fwd-slash path blocked", editBlocks("/tmp/app.js", 'const dir = "' + WIN_FWD + '";'));

// Linux paths blocked
ok("Linux home path blocked", writeBlocks("/tmp/app.py", 'path = "' + LINUX_PATH + '"'));

// macOS paths blocked
ok("macOS home path blocked", writeBlocks("/tmp/app.py", 'path = "' + MAC_PATH + '"'));

// Comment lines skipped
ok("JS comment line allowed", writePasses("/tmp/app.js", "// path: " + WIN_PATH));
ok("Python comment allowed", writePasses("/tmp/app.py", "# " + LINUX_PATH));
ok("Block comment allowed", writePasses("/tmp/app.js", "/* " + WIN_PATH + " */"));

// Markdown/text files exempt
ok(".md files exempt", writePasses("/tmp/README.md", "Install at " + WIN_PATH));
ok(".txt files exempt", writePasses("/tmp/notes.txt", LINUX_PATH));
ok(".html files exempt", writePasses("/tmp/page.html", WIN_PATH));

// CloudFormation YAML exempt
ok("CloudFormation yaml exempt", writePasses("/tmp/cloudformation/template.yaml", LINUX_PATH));

// Dockerfile exempt
ok("Dockerfile exempt", writePasses("/tmp/Dockerfile", "WORKDIR " + LINUX_PATH));

// Clean content passes
ok("relative path passes", writePasses("/tmp/app.js", 'var p = "./config/settings.json";'));
ok("variable path passes", writePasses("/tmp/app.js", 'var p = path.join(__dirname, "config");'));
ok("empty content passes", writePasses("/tmp/app.js", ""));

// Block message quality
var r = gate({tool_name: "Write", tool_input: {file_path: "/tmp/app.js", content: 'x = "' + WIN_PATH + '"'}});
ok("block mentions HARDCODED", r && /HARDCODED/i.test(r.reason));
ok("block mentions variable", r && /variable/i.test(r.reason));

// === T732: Bash file mutation tests ===
function bashBlocks(cmd) {
  var r2 = gate({tool_name: "Bash", tool_input: {command: cmd}});
  return r2 && r2.decision === "block";
}
function bashPasses(cmd) {
  return gate({tool_name: "Bash", tool_input: {command: cmd}}) === null;
}

// Bash echo with hardcoded Windows path → block
// Note: echo args with ; are excluded by T608 pattern fix, so use simple args
ok("Bash: echo Windows path blocked", bashBlocks('echo "path = ' + WIN_PATH + '" > /tmp/app.js'));

// Bash echo with hardcoded Linux path → block
ok("Bash: echo Linux path blocked", bashBlocks('echo "path = ' + LINUX_PATH + '" > /tmp/app.py'));

// Bash echo with hardcoded macOS path → block
ok("Bash: echo macOS path blocked", bashBlocks('echo "p = ' + MAC_PATH + '" > /tmp/app.py'));

// Bash printf with hardcoded path → block
ok("Bash: printf Windows path blocked", bashBlocks('printf "dir = ' + WIN_FWD + '" > /tmp/app.js'));

// Bash heredoc with hardcoded path → block
var heredocWin = 'cat > /tmp/app.js <<\'EOF\'\nvar p = "' + WIN_PATH + '";\nEOF';
ok("Bash: heredoc Windows path blocked", bashBlocks(heredocWin));

var heredocLinux = 'cat > /tmp/app.py <<\'EOF\'\npath = "' + LINUX_PATH + '"\nEOF';
ok("Bash: heredoc Linux path blocked", bashBlocks(heredocLinux));

// Bash echo with clean content → pass
ok("Bash: echo clean content passes", bashPasses('echo "var x = 42;" > /tmp/app.js'));

// Bash echo to .md file → pass (extension exempt)
ok("Bash: echo to .md passes", bashPasses('echo "' + WIN_PATH + '" > /tmp/README.md'));

// Bash read-only commands → pass
ok("Bash: cat without redirect passes", bashPasses("cat /tmp/app.js"));
ok("Bash: grep passes", bashPasses("grep pattern /tmp/app.js"));
ok("Bash: ls passes", bashPasses("ls -la /tmp"));

// Bash with no content extraction (cp, sed -i) → pass (can't check content)
ok("Bash: cp passes (no content to check)", bashPasses("cp /tmp/src.js /tmp/dst.js"));
ok("Bash: sed -i passes (no content to check)", bashPasses("sed -i 's/old/new/' /tmp/file.js"));

// Bash with comment lines in heredoc → pass
var heredocComment = 'cat > /tmp/app.js <<\'EOF\'\n// ' + WIN_PATH + '\nvar x = 1;\nEOF';
ok("Bash: heredoc with comment-only path passes", bashPasses(heredocComment));

// Block message quality for Bash
var br = gate({tool_name: "Bash", tool_input: {command: 'echo "x = \\"' + WIN_PATH + '\\"" > /tmp/app.js'}});
ok("Bash block mentions hardcoded/path", br && /hardcoded|path/i.test(br.reason));
ok("Bash block has WHY + NEXT STEPS", br && /WHY:/.test(br.reason) && /NEXT STEPS:/i.test(br.reason));

// Test files exempt (path fixtures are test data)
ok("Write to test file passes", gate({tool_name: "Write", tool_input: {content: LINUX_PATH, file_path: "scripts/test/test-something.js"}}) === null);
ok("Write to tests/ dir passes", gate({tool_name: "Write", tool_input: {content: WIN_PATH, file_path: "src/tests/test-gate.js"}}) === null);
ok("Edit in test file passes", gate({tool_name: "Edit", tool_input: {new_string: MAC_PATH, file_path: "test/test-foo.js"}}) === null);

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);

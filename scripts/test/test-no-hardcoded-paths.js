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
ok("Bash tool ignored", gate({tool_name: "Bash", tool_input: {}}) === null);

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

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);

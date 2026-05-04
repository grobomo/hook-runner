#!/usr/bin/env node
"use strict";
// Tests for --test-module path resolution (T618)
var cp = require("child_process");
var path = require("path");
var setupJs = path.join(__dirname, "../../setup.js");

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("OK: " + msg); } else { fail++; console.log("FAIL: " + msg); } }

function run(modName) {
  try {
    return cp.execSync("node " + JSON.stringify(setupJs) + " --test-module " + modName + " 2>&1", { encoding: "utf8" });
  } catch(e) {
    return e.stdout || e.stderr || e.message;
  }
}

// 1. Bare module name resolves to PreToolUse
var r1 = run("force-push-gate");
ok(r1.indexOf("Module:") !== -1 && r1.indexOf("PreToolUse") !== -1, "Bare name resolves to PreToolUse");

// 2. Bare name with .js suffix also works
var r2 = run("force-push-gate.js");
ok(r2.indexOf("Module:") !== -1 && r2.indexOf("PreToolUse") !== -1, "Name with .js suffix resolves");

// 3. PostToolUse module resolves
var r3 = run("disk-space-detect");
ok(r3.indexOf("Module:") !== -1 && r3.indexOf("PostToolUse") !== -1, "PostToolUse module resolves");

// 4. Stop module resolves
var r4 = run("auto-continue");
ok(r4.indexOf("Module:") !== -1 && r4.indexOf("Stop") !== -1, "Stop module resolves");

// 5. SessionStart module resolves
var r5 = run("load-lessons");
ok(r5.indexOf("Module:") !== -1 && r5.indexOf("SessionStart") !== -1, "SessionStart module resolves");

// 6. Nonexistent module shows error
var r6 = run("does-not-exist-xyz");
ok(r6.indexOf("Module not found") !== -1, "Nonexistent module shows error");
ok(r6.indexOf("Searched modules/") !== -1, "Error mentions search locations");

// 7. Full path still works
var fullPath = path.join(__dirname, "../../modules/PreToolUse/force-push-gate.js");
var r7 = run(JSON.stringify(fullPath));
ok(r7.indexOf("Module:") !== -1 && r7.indexOf("force-push-gate") !== -1, "Full path still works");

// 8. Shows WHY and WORKFLOW headers
ok(r1.indexOf("WHY comment: yes") !== -1, "Shows WHY comment status");
ok(r1.indexOf("WORKFLOW tag:") !== -1, "Shows WORKFLOW tag");

// 9. Runs sample inputs
ok(r1.indexOf("inputs:") !== -1, "Runs sample inputs");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

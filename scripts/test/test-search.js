#!/usr/bin/env node
"use strict";
// Tests for --search feature (T621)
var cp = require("child_process");
var path = require("path");
var setupJs = path.join(__dirname, "../../setup.js");

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("OK: " + msg); } else { fail++; console.log("FAIL: " + msg); } }

function run(args) {
  try {
    return cp.execSync("node " + JSON.stringify(setupJs) + " " + args + " 2>&1", { encoding: "utf8" });
  } catch(e) {
    return { output: (e.stdout || "") + (e.stderr || ""), status: e.status };
  }
}

// Test 1: --search with matching name
var r1 = run("--search git");
ok(typeof r1 === "string" && r1.indexOf("modules matching") !== -1, "--search git shows match count");
ok(r1.indexOf("git-destructive-guard") !== -1, "--search git finds git-destructive-guard");
ok(r1.indexOf("git-rebase-safety") !== -1, "--search git finds git-rebase-safety");

// Test 2: --search is case-insensitive
var r2 = run("--search GIT");
ok(typeof r2 === "string" && r2.indexOf("git-destructive-guard") !== -1, "--search GIT (uppercase) finds modules");

// Test 3: --search matches WHY descriptions too
var r3 = run("--search polling");
ok(typeof r3 === "string" && r3.indexOf("no-polling-gate") !== -1, "--search polling finds no-polling-gate via WHY");

// Test 4: --search with no matches
var r4 = run("--search zzz_nonexistent_xyz");
ok(typeof r4 === "string" && r4.indexOf("No modules matching") !== -1, "--search with no matches shows message");

// Test 5: --search with no query shows usage
var r5 = run("--search");
ok(typeof r5 === "object" && r5.status === 1, "--search with no query exits with code 1");
ok(r5.output.indexOf("Usage:") !== -1, "--search with no query shows usage");

// Test 6: Results show event type prefix
ok(r1.indexOf("PreToolUse/") !== -1, "Results include event type prefix");

// Test 7: Results show install status
ok(r1.indexOf("[installed]") !== -1 || r1.indexOf("[available]") !== -1, "Results show install status");

// Test 8: Results show WHY descriptions
ok(r1.indexOf("    ") !== -1, "Results include indented WHY descriptions");

// Test 9: --search force finds force-push-gate
var r9 = run("--search force");
ok(typeof r9 === "string" && r9.indexOf("force-push-gate") !== -1, "--search force finds force-push-gate");

// Test 10: --search secret finds secret-scan-gate
var r10 = run("--search secret");
ok(typeof r10 === "string" && r10.indexOf("secret-scan-gate") !== -1, "--search secret finds secret-scan-gate");
ok(r10.indexOf("1 module") !== -1, "--search secret shows singular 'module'");

// Test 11: --search with partial match finds modules
var r11 = run("--search deploy");
ok(typeof r11 === "string" && r11.indexOf("deploy") !== -1, "--search deploy finds deploy-related modules");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

#!/usr/bin/env node
"use strict";
// Tests for --list --why feature (T615)
var cp = require("child_process");
var path = require("path");
var setupJs = path.join(__dirname, "../../setup.js");

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("OK: " + msg); } else { fail++; console.log("FAIL: " + msg); } }

// Test 1: --list without --why shows no WHY descriptions
var r1 = cp.execSync("node " + JSON.stringify(setupJs) + " --list 2>&1", { encoding: "utf8" });
ok(r1.indexOf("[hook-runner] Module List") !== -1, "--list shows header");
ok(r1.indexOf("force-push-gate") !== -1, "--list shows module names");
// WHY lines are indented with 6 spaces and start with a capital letter describing the incident
// Check that no WHY-style description appears (they'd be on indented sub-lines)
var lines1 = r1.split("\n").filter(function(l) { return /^      [A-Z]/.test(l); });
ok(lines1.length === 0, "--list without --why shows no descriptions");

// Test 2: --list --why shows WHY descriptions
var r2 = cp.execSync("node " + JSON.stringify(setupJs) + " --list --why 2>&1", { encoding: "utf8" });
ok(r2.indexOf("[hook-runner] Module List") !== -1, "--list --why shows header");
ok(r2.indexOf("force-push-gate") !== -1, "--list --why shows module names");
// Should have description lines (6-space indented)
var lines2 = r2.split("\n").filter(function(l) { return /^      [A-Z]/.test(l); });
ok(lines2.length > 10, "--list --why shows descriptions (" + lines2.length + " found)");

// Test 3: WHY descriptions are truncated at 72 chars
var longLines = lines2.filter(function(l) { return l.trim().length > 72; });
ok(longLines.length === 0, "WHY descriptions truncated to 72 chars");

// Test 4: Truncated lines end with ...
var truncated = lines2.filter(function(l) { return l.trim().endsWith("..."); });
ok(truncated.length > 0, "Some descriptions are truncated with ...");

// Test 5: Helper modules (underscore prefix) may not have WHY
// _bash-write-patterns has WHY, _file-modify-patterns may not — just verify no crash
ok(r2.indexOf("_bash-write-patterns") !== -1, "Helper modules listed even with --why");

// Test 6: Summary line still shows counts
ok(/\d+ installed, \d+ in catalog/.test(r2), "--list --why still shows summary counts");

// Test 7: --list --why output is longer than --list
ok(r2.length > r1.length, "--list --why output is longer than --list");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

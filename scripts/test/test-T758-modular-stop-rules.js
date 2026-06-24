#!/usr/bin/env node
"use strict";
// T758: Test modular stop rules — individual YAML files in rules/stop/
var fs = require("fs");
var path = require("path");

var REPO_DIR = path.join(__dirname, "..", "..");
var RULES_DIR = path.join(REPO_DIR, "rules", "stop");

var passed = 0;
var failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log("    OK: " + msg); }
  else { failed++; console.log("    FAIL: " + msg); }
}

// Test 1: rules/stop/ directory exists
ok(fs.existsSync(RULES_DIR), "rules/stop/ directory exists");

// Test 2: has YAML files
var files = [];
try {
  files = fs.readdirSync(RULES_DIR)
    .filter(function(f) { return /\.yaml$/.test(f) && !f.startsWith("_"); })
    .sort();
} catch (e) {}
ok(files.length >= 20, "has " + files.length + " active rule files (expected >= 20)");

// Test 3: all files parse correctly (name, check, action)
var parseErrors = [];
var rules = [];
for (var i = 0; i < files.length; i++) {
  var content = fs.readFileSync(path.join(RULES_DIR, files[i]), "utf-8");
  var rule = {};
  var nm = content.match(/^name:\s*(.+)/m);
  var ck = content.match(/^check:\s*"(.+)"/m);
  var ac = content.match(/^action:\s*"(.+)"/m);
  if (nm) rule.name = nm[1].trim();
  if (ck) rule.check = ck[1];
  if (ac) rule.action = ac[1];
  if (!rule.name || !rule.check || !rule.action) {
    // Skip stub/superseded files that are intentionally empty
    if (/SUPERSEDED/.test(content)) continue;
    parseErrors.push(files[i] + " (name=" + !!rule.name + " check=" + !!rule.check + " action=" + !!rule.action + ")");
  } else {
    rules.push(rule);
  }
}
ok(parseErrors.length === 0, "all files parse correctly" + (parseErrors.length > 0 ? " (errors: " + parseErrors.join(", ") + ")" : ""));

// Test 4: no duplicate rule names
var names = rules.map(function(r) { return r.name; });
var uniqueNames = [];
var dupes = [];
for (var j = 0; j < names.length; j++) {
  if (uniqueNames.indexOf(names[j]) !== -1) dupes.push(names[j]);
  else uniqueNames.push(names[j]);
}
ok(dupes.length === 0, "no duplicate rule names" + (dupes.length > 0 ? " (dupes: " + dupes.join(", ") + ")" : ""));

// Test 5: files are numbered for ordering (NN-name.yaml)
var unnumbered = files.filter(function(f) { return !/^\d{2}-/.test(f); });
ok(unnumbered.length === 0, "all files are numbered (NN-prefix)" + (unnumbered.length > 0 ? " (unnumbered: " + unnumbered.join(", ") + ")" : ""));

// Test 6: key rules exist
var ruleNames = rules.map(function(r) { return r.name; });
var keyRules = ["never-ask-permission", "todo-awareness", "obvious-follow-up", "never-give-up", "keep-working"];
var missingKey = keyRules.filter(function(k) { return ruleNames.indexOf(k) === -1; });
ok(missingKey.length === 0, "key rules present" + (missingKey.length > 0 ? " (missing: " + missingKey.join(", ") + ")" : ""));

// Test 7: check fields are non-trivial (> 20 chars)
var shortChecks = rules.filter(function(r) { return r.check.length < 20; });
ok(shortChecks.length === 0, "all check fields are non-trivial (>20 chars)" + (shortChecks.length > 0 ? " (short: " + shortChecks.map(function(r) { return r.name; }).join(", ") + ")" : ""));

// Test 8: action fields specify a verb (CONTINUE/NEXT/DISPATCH/DONE/CORRECT) or reference one
var noVerb = rules.filter(function(r) { return !/\b(CONTINUE|NEXT|DISPATCH|DONE|CORRECT)\b/.test(r.action); });
ok(noVerb.length === 0, "all actions reference CONTINUE/NEXT/DISPATCH/DONE/CORRECT" + (noVerb.length > 0 ? " (bad: " + noVerb.map(function(r) { return r.name; }).join(", ") + ")" : ""));

// Test 9: files have header comments
var noHeader = [];
for (var h = 0; h < files.length; h++) {
  var c = fs.readFileSync(path.join(RULES_DIR, files[h]), "utf-8");
  if (!c.startsWith("#")) noHeader.push(files[h]);
}
ok(noHeader.length === 0, "all files have header comments" + (noHeader.length > 0 ? " (missing: " + noHeader.join(", ") + ")" : ""));

// Test 10: disabled files (if any) are excluded by underscore prefix
var allFiles = fs.readdirSync(RULES_DIR).filter(function(f) { return /\.yaml$/.test(f); });
var disabledFiles = allFiles.filter(function(f) { return f.startsWith("_"); });
var activeFiles = allFiles.filter(function(f) { return !f.startsWith("_"); });
ok(true, "active: " + activeFiles.length + ", disabled: " + disabledFiles.length + " (total: " + allFiles.length + ")");

// Test 11: minimum rule count (grows as new rules are added)
ok(rules.length >= 25, "rule count (" + rules.length + ") meets minimum (25)");

// Test 12: most rule actions use 'VERB — instruction' format (meta-rules like metacognate-next are exceptions)
var META_RULES = ["keep-working"]; // these use a different format by design
var noDash = rules.filter(function(r) {
  if (META_RULES.indexOf(r.name) !== -1) return false;
  return !/^(CONTINUE|NEXT|DISPATCH|DONE|CORRECT)\s+—/.test(r.action);
});
ok(noDash.length === 0, "standard rules use 'VERB — instruction' format" + (noDash.length > 0 ? " (bad: " + noDash.map(function(r) { return r.name; }).join(", ") + ")" : ""));

console.log("\n    " + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);

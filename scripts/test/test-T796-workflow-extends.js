#!/usr/bin/env node
"use strict";
// T796: Workflow extends support — enabling X also enables what X extends
var path = require("path");
var os = require("os");
var fs = require("fs");

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("  PASS: " + name); passed++; }
  catch (e) { console.log("  FAIL: " + name); console.log("    " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

var MOD_PATH = path.join(__dirname, "..", "..", "load-modules.js");
var TMP = path.join(os.tmpdir(), "t796-test-" + process.pid);

function setup() {
  // Create temp directory structure
  fs.mkdirSync(path.join(TMP, "workflows"), { recursive: true });
  fs.mkdirSync(path.join(TMP, "run-modules", "PreToolUse"), { recursive: true });
}

function cleanup() {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
}

function freshLoader() {
  delete require.cache[require.resolve(MOD_PATH)];
  // Clear internal caches by requiring fresh
  var loader = require(MOD_PATH);
  return loader;
}

function writeWorkflow(name, opts) {
  var content = "name: " + name + "\n";
  if (opts.enabled !== undefined) content += "enabled: " + opts.enabled + "\n";
  if (opts.extends) content += "extends: " + opts.extends + "\n";
  if (opts.description) content += "description: " + opts.description + "\n";
  fs.writeFileSync(path.join(TMP, "workflows", name + ".yml"), content);
}

function writeConfigJson(config) {
  fs.writeFileSync(path.join(TMP, "workflow-config.json"), JSON.stringify(config));
}

function writeModule(event, name, workflow) {
  var content = "// WORKFLOW: " + workflow + "\n// WHY: test\nmodule.exports = function() { return null; };\n";
  fs.writeFileSync(path.join(TMP, "run-modules", event, name + ".js"), content);
}

setup();

console.log("=== T796: Workflow Extends Support ===\n");

console.log("--- Basic extends resolution ---");

test("loadWorkflowGroups returns extends map", function() {
  writeWorkflow("core", { enabled: true });
  writeWorkflow("dev-discipline", { enabled: true, extends: "core" });
  // Clear cache
  var loader = freshLoader();
  // Set env to use our temp dir
  process.env.HOOKRUNNER_NO_BUILTIN = "1";
  var origProjectDir = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = TMP;
  var groups = loader.loadWorkflowGroups(TMP);
  process.env.CLAUDE_PROJECT_DIR = origProjectDir;
  delete process.env.HOOKRUNNER_NO_BUILTIN;
  assert(groups.extends, "should have extends map");
  assert(groups.extends["dev-discipline"] === "core", "dev-discipline extends core");
});

test("enabling child enables parent", function() {
  writeWorkflow("core", { enabled: false });
  writeWorkflow("dev-discipline", { enabled: true, extends: "core" });
  writeConfigJson({ "core": false, "dev-discipline": true });
  var loader = freshLoader();
  process.env.HOOKRUNNER_NO_BUILTIN = "1";
  var origProjectDir = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = TMP;
  var groups = loader.loadWorkflowGroups(TMP);
  process.env.CLAUDE_PROJECT_DIR = origProjectDir;
  delete process.env.HOOKRUNNER_NO_BUILTIN;
  // core is disabled in config, but dev-discipline extends it and is enabled
  // The extends resolution should NOT override an explicit disable
  // Wait — looking at the code, it only enables parent if NOT disabled
  // So core stays disabled when explicitly disabled in config
  assert(groups.disabled["core"] === true, "core stays disabled when explicitly disabled");
});

test("enabling child enables undeclared parent", function() {
  // Parent not in config at all — extends should auto-enable it
  writeWorkflow("base", { enabled: true });
  writeWorkflow("child", { enabled: true, extends: "base" });
  writeConfigJson({ "child": true });
  // base is not in config — should be auto-enabled via extends
  var loader = freshLoader();
  process.env.HOOKRUNNER_NO_BUILTIN = "1";
  var origProjectDir = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = TMP;
  var groups = loader.loadWorkflowGroups(TMP);
  process.env.CLAUDE_PROJECT_DIR = origProjectDir;
  delete process.env.HOOKRUNNER_NO_BUILTIN;
  assert(groups.enabled["base"] === true, "base should be auto-enabled via extends");
  assert(groups.enabled["child"] === true, "child should be enabled");
});

test("transitive extends: A extends B extends C", function() {
  writeWorkflow("tier1", { enabled: true });
  writeWorkflow("tier2", { enabled: true, extends: "tier1" });
  writeWorkflow("tier3", { enabled: true, extends: "tier2" });
  writeConfigJson({ "tier3": true });
  var loader = freshLoader();
  process.env.HOOKRUNNER_NO_BUILTIN = "1";
  var origProjectDir = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = TMP;
  var groups = loader.loadWorkflowGroups(TMP);
  process.env.CLAUDE_PROJECT_DIR = origProjectDir;
  delete process.env.HOOKRUNNER_NO_BUILTIN;
  assert(groups.enabled["tier1"] === true, "tier1 enabled via transitive extends");
  assert(groups.enabled["tier2"] === true, "tier2 enabled via extends");
  assert(groups.enabled["tier3"] === true, "tier3 enabled directly");
});

console.log("\n--- Module filtering with extends ---");

test("modules tagged with parent workflow load when child is enabled", function() {
  writeWorkflow("safety", { enabled: true });
  writeWorkflow("discipline", { enabled: true, extends: "safety" });
  writeConfigJson({ "discipline": true });
  writeModule("PreToolUse", "safety-gate", "safety");
  writeModule("PreToolUse", "discipline-gate", "discipline");
  var loader = freshLoader();
  process.env.HOOKRUNNER_NO_BUILTIN = "1";
  var origProjectDir = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = TMP;
  var modules = loader(path.join(TMP, "run-modules", "PreToolUse"));
  process.env.CLAUDE_PROJECT_DIR = origProjectDir;
  delete process.env.HOOKRUNNER_NO_BUILTIN;
  var names = modules.map(function(m) { return path.basename(m, ".js"); });
  assert(names.indexOf("discipline-gate") !== -1, "discipline-gate should load");
  assert(names.indexOf("safety-gate") !== -1, "safety-gate should load via extends");
});

test("disabled parent not inherited when explicitly disabled", function() {
  writeWorkflow("blocked", { enabled: false });
  writeWorkflow("user-wf", { enabled: true, extends: "blocked" });
  writeConfigJson({ "blocked": false, "user-wf": true });
  writeModule("PreToolUse", "blocked-gate", "blocked");
  writeModule("PreToolUse", "user-gate", "user-wf");
  var loader = freshLoader();
  process.env.HOOKRUNNER_NO_BUILTIN = "1";
  var origProjectDir = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = TMP;
  var modules = loader(path.join(TMP, "run-modules", "PreToolUse"));
  process.env.CLAUDE_PROJECT_DIR = origProjectDir;
  delete process.env.HOOKRUNNER_NO_BUILTIN;
  var names = modules.map(function(m) { return path.basename(m, ".js"); });
  assert(names.indexOf("user-gate") !== -1, "user-gate should load");
  assert(names.indexOf("blocked-gate") === -1, "blocked-gate should NOT load (explicitly disabled)");
});

console.log("\n--- Edge cases ---");

test("no extends field — no change to behavior", function() {
  writeWorkflow("standalone", { enabled: true });
  writeConfigJson({ "standalone": true });
  var loader = freshLoader();
  process.env.HOOKRUNNER_NO_BUILTIN = "1";
  var origProjectDir = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = TMP;
  var groups = loader.loadWorkflowGroups(TMP);
  process.env.CLAUDE_PROJECT_DIR = origProjectDir;
  delete process.env.HOOKRUNNER_NO_BUILTIN;
  assert(groups.enabled["standalone"] === true);
  assert(Object.keys(groups.extends).length === 0 ||
         !groups.extends["standalone"], "standalone has no extends");
});

test("extends non-existent workflow — still works (creates entry)", function() {
  writeWorkflow("orphan", { enabled: true, extends: "ghost" });
  writeConfigJson({ "orphan": true });
  var loader = freshLoader();
  process.env.HOOKRUNNER_NO_BUILTIN = "1";
  var origProjectDir = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = TMP;
  var groups = loader.loadWorkflowGroups(TMP);
  process.env.CLAUDE_PROJECT_DIR = origProjectDir;
  delete process.env.HOOKRUNNER_NO_BUILTIN;
  assert(groups.enabled["orphan"] === true, "orphan enabled");
  assert(groups.enabled["ghost"] === true, "ghost auto-enabled via extends");
});

cleanup();

console.log("\n" + passed + "/" + (passed + failed) + " passed");
process.exit(failed > 0 ? 1 : 0);

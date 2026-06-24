#!/usr/bin/env node
// Test: T752 modular plugin system — external project integration
"use strict";

var path = require("path");
var fs = require("fs");
var os = require("os");
var REPO_DIR = path.resolve(__dirname, "../..");

process.env.HOOK_RUNNER_TEST = "1";
// Prevent built-in workflow YAMLs from interfering
process.env.HOOKRUNNER_NO_BUILTIN = "1";

var pass = 0, fail = 0;

function ok(label, condition) {
  if (condition) {
    console.log("  PASS: " + label);
    pass++;
  } else {
    console.log("  FAIL: " + label);
    fail++;
  }
}

console.log("=== T752: Plugin System ===");

// Setup: create temp plugin directory structure
var tmpDir = path.join(os.tmpdir(), "test-t752-" + process.pid);
var pluginsDir = path.join(tmpDir, ".claude", "hooks", "plugins");
var modulesDir = path.join(tmpDir, "modules");
var preToolDir = path.join(modulesDir, "PreToolUse");
var postToolDir = path.join(modulesDir, "PostToolUse");

// Create plugin with PreToolUse and PostToolUse modules
var pluginName = "test-plugin";
var pluginPreDir = path.join(pluginsDir, pluginName, "PreToolUse");
var pluginPostDir = path.join(pluginsDir, pluginName, "PostToolUse");

function setup() {
  try {
    fs.mkdirSync(preToolDir, { recursive: true });
    fs.mkdirSync(postToolDir, { recursive: true });
    fs.mkdirSync(pluginPreDir, { recursive: true });
    fs.mkdirSync(pluginPostDir, { recursive: true });
  } catch (e) {}

  // Create a global module
  fs.writeFileSync(path.join(preToolDir, "global-gate.js"),
    '// WHY: test\n"use strict";\nmodule.exports = function(input) { return null; };\n');

  // Create plugin modules
  fs.writeFileSync(path.join(pluginPreDir, "plugin-gate.js"),
    '// WHY: test plugin gate\n"use strict";\nmodule.exports = function(input) { return null; };\n');
  fs.writeFileSync(path.join(pluginPostDir, "plugin-check.js"),
    '// WHY: test plugin check\n"use strict";\nmodule.exports = function(input) { return null; };\n');
}

function cleanup() {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
}

// Fresh require
function freshLoadModules() {
  delete require.cache[require.resolve(path.join(REPO_DIR, "load-modules.js"))];
  return require(path.join(REPO_DIR, "load-modules.js"));
}

// Save and restore HOME
var origHome = process.env.HOME;
var origUserProfile = process.env.USERPROFILE;

setup();

// --- Test Group 1: Plugin modules loaded alongside global ---
console.log("\n--- Plugin loading ---");

process.env.HOME = tmpDir;
process.env.USERPROFILE = tmpDir;

var loadModules = freshLoadModules();
var preMods = loadModules(preToolDir);

ok("global module loaded", preMods.some(function(p) { return p.indexOf("global-gate.js") !== -1; }));
ok("plugin module loaded", preMods.some(function(p) { return p.indexOf("plugin-gate.js") !== -1; }));
ok("total PreToolUse = global + plugin", preMods.length === 2);

// --- Test Group 2: Plugin modules for correct event only ---
console.log("\n--- Event scoping ---");

var postMods = loadModules(postToolDir);
ok("PostToolUse plugin module loaded", postMods.some(function(p) { return p.indexOf("plugin-check.js") !== -1; }));
ok("PreToolUse plugin not in PostToolUse", !postMods.some(function(p) { return p.indexOf("plugin-gate.js") !== -1; }));

// --- Test Group 3: No plugins dir = no crash ---
console.log("\n--- No plugins dir ---");

var noPluginDir = path.join(os.tmpdir(), "test-t752-noplug-" + process.pid);
try { fs.mkdirSync(path.join(noPluginDir, ".claude", "hooks"), { recursive: true }); } catch (e) {}
try { fs.mkdirSync(path.join(noPluginDir, "modules", "PreToolUse"), { recursive: true }); } catch (e) {}
fs.writeFileSync(path.join(noPluginDir, "modules", "PreToolUse", "test.js"),
  '// WHY: test\n"use strict";\nmodule.exports = function(input) { return null; };\n');

process.env.HOME = noPluginDir;
process.env.USERPROFILE = noPluginDir;
loadModules = freshLoadModules();
var noPluginMods = loadModules(path.join(noPluginDir, "modules", "PreToolUse"));
ok("no plugins dir — no crash", noPluginMods.length === 1);
try { fs.rmSync(noPluginDir, { recursive: true, force: true }); } catch (e) {}

// --- Test Group 4: Multiple plugins ---
console.log("\n--- Multiple plugins ---");

process.env.HOME = tmpDir;
process.env.USERPROFILE = tmpDir;

var plugin2PreDir = path.join(pluginsDir, "second-plugin", "PreToolUse");
try { fs.mkdirSync(plugin2PreDir, { recursive: true }); } catch (e) {}
fs.writeFileSync(path.join(plugin2PreDir, "second-gate.js"),
  '// WHY: test second plugin\n"use strict";\nmodule.exports = function(input) { return null; };\n');

loadModules = freshLoadModules();
preMods = loadModules(preToolDir);
ok("second plugin loaded", preMods.some(function(p) { return p.indexOf("second-gate.js") !== -1; }));
ok("total = global + 2 plugins", preMods.length === 3);

// --- Test Group 5: Plugin modules with _ prefix skipped ---
console.log("\n--- Underscore skip ---");

fs.writeFileSync(path.join(pluginPreDir, "_helper.js"),
  '// WHY: helper\n"use strict";\nmodule.exports = {};\n');
loadModules = freshLoadModules();
preMods = loadModules(preToolDir);
ok("_helper.js skipped", !preMods.some(function(p) { return p.indexOf("_helper.js") !== -1; }));

// --- Test Group 6: Plugin modules respect workflow filtering ---
console.log("\n--- Workflow filtering ---");

fs.writeFileSync(path.join(pluginPreDir, "workflow-gate.js"),
  '// WORKFLOW: nonexistent-workflow\n// WHY: test\n"use strict";\nmodule.exports = function(input) { return null; };\n');
loadModules = freshLoadModules();
preMods = loadModules(preToolDir);
ok("plugin with inactive workflow excluded", !preMods.some(function(p) { return p.indexOf("workflow-gate.js") !== -1; }));

// --- Cleanup ---
cleanup();
process.env.HOME = origHome;
process.env.USERPROFILE = origUserProfile;

// --- Summary ---
console.log("\n" + (pass + fail) + " tests: " + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

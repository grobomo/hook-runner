#!/usr/bin/env node
"use strict";
// T604: Tests for diagnose.js — hook diagnostics tool
// Validates settings resolution, hook extraction, validation, and fix mode.

var path = require("path");
var fs = require("fs");
var os = require("os");
var modPath = path.join(__dirname, "..", "..", "diagnose.js");
var passed = 0, failed = 0, failures = [];

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; failures.push(name + " — " + e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

function loadMod() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

// Create a temp directory structure for testing
var TMPDIR = path.join(os.tmpdir(), "diagnose-test-" + process.pid);
var PROJECT_DIR = path.join(TMPDIR, "myproject");

function setup() {
  fs.mkdirSync(path.join(PROJECT_DIR, ".claude"), { recursive: true });
}

function cleanup() {
  try { fs.rmSync(TMPDIR, { recursive: true, force: true }); } catch (e) {}
}

setup();

// === resolveSettingsFiles tests ===

check("resolveSettingsFiles returns user-global and project entries", function() {
  var mod = loadMod();
  var files = mod.resolveSettingsFiles(PROJECT_DIR);
  assert(files.length >= 4, "should have at least 4 entries (user-global, user-local, project, project-local)");
  var scopes = files.map(function(f) { return f.scope; });
  assert(scopes.indexOf("user-global") !== -1, "should have user-global");
  assert(scopes.indexOf("user-local") !== -1, "should have user-local");
  assert(scopes.indexOf("project") !== -1, "should have project");
  assert(scopes.indexOf("project-local") !== -1, "should have project-local");
});

check("resolveSettingsFiles detects existing settings.json", function() {
  // Create a project settings.json
  fs.writeFileSync(path.join(PROJECT_DIR, ".claude", "settings.json"), '{"hooks":{}}');
  var mod = loadMod();
  var files = mod.resolveSettingsFiles(PROJECT_DIR);
  var projFile = files.filter(function(f) { return f.scope === "project"; })[0];
  assert(projFile, "should have project entry");
  assert(projFile.exists === true, "project settings.json should exist");
});

check("resolveSettingsFiles marks missing files as not existing", function() {
  var mod = loadMod();
  var files = mod.resolveSettingsFiles(PROJECT_DIR);
  var projLocal = files.filter(function(f) { return f.scope === "project-local"; })[0];
  assert(projLocal, "should have project-local entry");
  assert(projLocal.exists === false, "project-local should not exist");
});

check("resolveSettingsFiles deduplicates paths", function() {
  var mod = loadMod();
  var files = mod.resolveSettingsFiles(PROJECT_DIR);
  var paths = files.map(function(f) { return f.path.replace(/\\/g, "/").toLowerCase(); });
  var uniquePaths = [];
  for (var i = 0; i < paths.length; i++) {
    assert(uniquePaths.indexOf(paths[i]) === -1, "duplicate path: " + paths[i]);
    uniquePaths.push(paths[i]);
  }
});

check("resolveSettingsFiles detects ancestor .claude dirs", function() {
  // Create an ancestor .claude dir
  fs.mkdirSync(path.join(TMPDIR, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(TMPDIR, ".claude", "settings.json"), '{}');
  var mod = loadMod();
  var files = mod.resolveSettingsFiles(PROJECT_DIR);
  var ancestorFiles = files.filter(function(f) { return f.scope.indexOf("ancestor:") === 0; });
  assert(ancestorFiles.length > 0, "should detect ancestor .claude dir");
});

// === diagnose tests ===

check("diagnose returns proper structure", function() {
  var mod = loadMod();
  var result = mod.diagnose(PROJECT_DIR);
  assert(result.projectDir, "should have projectDir");
  assert(Array.isArray(result.settingsFiles), "should have settingsFiles array");
  assert(Array.isArray(result.hooks), "should have hooks array");
  assert(Array.isArray(result.broken), "should have broken array");
  assert(result.summary, "should have summary");
  assert(typeof result.summary.totalHooks === "number", "summary should have totalHooks");
});

check("diagnose extracts hooks from settings", function() {
  // Write a settings file with hooks
  var settings = {
    hooks: {
      PreToolUse: [{
        matcher: "Bash",
        hooks: [
          { command: "echo hello", type: "command" },
          { command: "echo world", type: "command" }
        ]
      }],
      Stop: [{
        hooks: [
          { command: "echo bye", type: "command" }
        ]
      }]
    }
  };
  fs.writeFileSync(path.join(PROJECT_DIR, ".claude", "settings.json"), JSON.stringify(settings));
  var mod = loadMod();
  var result = mod.diagnose(PROJECT_DIR);
  // Count hooks from the project settings (there may also be user-global hooks)
  var projectHooks = result.hooks.filter(function(h) { return h.scope === "project"; });
  assert(projectHooks.length === 3, "should have 3 hooks from project settings, got " + projectHooks.length);
});

check("diagnose detects broken hooks (missing script)", function() {
  var settings = {
    hooks: {
      PreToolUse: [{
        hooks: [
          { command: 'node "/nonexistent/path/to/script.js"', type: "command" }
        ]
      }]
    }
  };
  fs.writeFileSync(path.join(PROJECT_DIR, ".claude", "settings.json"), JSON.stringify(settings));
  var mod = loadMod();
  var result = mod.diagnose(PROJECT_DIR);
  assert(result.broken.length > 0, "should detect broken hook");
  assert(result.broken[0].validation.error === "script not found", "error should be 'script not found'");
});

check("diagnose handles unparseable commands gracefully", function() {
  var settings = {
    hooks: {
      Stop: [{
        hooks: [
          { command: "echo hello | grep world", type: "command" }
        ]
      }]
    }
  };
  fs.writeFileSync(path.join(PROJECT_DIR, ".claude", "settings.json"), JSON.stringify(settings));
  var mod = loadMod();
  var result = mod.diagnose(PROJECT_DIR);
  var stopHooks = result.hooks.filter(function(h) { return h.event === "Stop" && h.scope === "project"; });
  assert(stopHooks.length > 0, "should have stop hook");
  assert(stopHooks[0].validation.unparseable === true, "should mark inline bash as unparseable");
  assert(result.broken.length === 0, "unparseable commands should NOT be broken");
});

check("diagnose handles corrupt settings.json", function() {
  fs.writeFileSync(path.join(PROJECT_DIR, ".claude", "settings.json"), "NOT JSON{{{");
  var mod = loadMod();
  var result = mod.diagnose(PROJECT_DIR);
  var projFile = result.settingsFiles.filter(function(f) { return f.scope === "project"; })[0];
  assert(projFile.parseError, "should have parseError");
});

check("diagnose handles empty hooks object", function() {
  fs.writeFileSync(path.join(PROJECT_DIR, ".claude", "settings.json"), '{"hooks":{}}');
  var mod = loadMod();
  var result = mod.diagnose(PROJECT_DIR);
  var projectHooks = result.hooks.filter(function(h) { return h.scope === "project"; });
  assert(projectHooks.length === 0, "should have 0 project hooks");
});

check("diagnose handles settings with no hooks key", function() {
  fs.writeFileSync(path.join(PROJECT_DIR, ".claude", "settings.json"), '{"permissions":["allow"]}');
  var mod = loadMod();
  var result = mod.diagnose(PROJECT_DIR);
  // Should not crash
  assert(result.summary, "should complete without error");
});

// === fixBrokenHooks tests ===

check("fixBrokenHooks removes broken hooks from settings", function() {
  var settingsPath = path.join(PROJECT_DIR, ".claude", "settings.json");
  var settings = {
    hooks: {
      PreToolUse: [{
        hooks: [
          { command: "echo hello", type: "command" },
          { command: 'node "/nonexistent/broken-script.js"', type: "command" }
        ]
      }]
    }
  };
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
  var mod = loadMod();
  var result = mod.diagnose(PROJECT_DIR);
  assert(result.broken.length > 0, "should have broken hooks before fix");
  mod.fixBrokenHooks(result);
  // Re-diagnose
  var result2 = mod.diagnose(PROJECT_DIR);
  var projectBroken = result2.broken.filter(function(h) { return h.scope === "project"; });
  assert(projectBroken.length === 0, "should have 0 broken project hooks after fix");
});

check("fixBrokenHooks preserves valid hooks", function() {
  var settingsPath = path.join(PROJECT_DIR, ".claude", "settings.json");
  var settings = {
    hooks: {
      Stop: [{
        hooks: [
          { command: "echo hello", type: "command" },
          { command: 'node "/nonexistent/path.js"', type: "command" }
        ]
      }]
    }
  };
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
  var mod = loadMod();
  var result = mod.diagnose(PROJECT_DIR);
  mod.fixBrokenHooks(result);
  // Read back
  var fixed = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  // The "echo hello" hook is unparseable (no script path) so it survives
  assert(fixed.hooks.Stop, "Stop hooks should still exist");
  var hookCount = 0;
  for (var g = 0; g < fixed.hooks.Stop.length; g++) {
    hookCount += (fixed.hooks.Stop[g].hooks || []).length;
  }
  assert(hookCount === 1, "should have 1 remaining hook, got " + hookCount);
});

check("fixBrokenHooks removes empty event groups", function() {
  var settingsPath = path.join(PROJECT_DIR, ".claude", "settings.json");
  var settings = {
    hooks: {
      PreToolUse: [{
        hooks: [
          { command: 'node "/nonexistent/only-broken.js"', type: "command" }
        ]
      }]
    }
  };
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
  var mod = loadMod();
  var result = mod.diagnose(PROJECT_DIR);
  mod.fixBrokenHooks(result);
  var fixed = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  assert(!fixed.hooks.PreToolUse, "should remove empty PreToolUse event");
});

// === validateHookCommand patterns ===

check("validates node script with quotes", function() {
  var mod = loadMod();
  // Create a real script
  var scriptPath = path.join(TMPDIR, "test-script.js");
  fs.writeFileSync(scriptPath, "// test");
  var cmdPath = scriptPath.replace(/\\/g, "/");
  var cmd = 'node "' + cmdPath + '"';
  var settings = {
    hooks: {
      Stop: [{
        hooks: [
          { command: cmd, type: "command" }
        ]
      }]
    }
  };
  fs.writeFileSync(path.join(PROJECT_DIR, ".claude", "settings.json"), JSON.stringify(settings));
  var result = mod.diagnose(PROJECT_DIR);
  var stopHooks = result.hooks.filter(function(h) { return h.event === "Stop" && h.scope === "project"; });
  assert(stopHooks.length === 1, "should have 1 stop hook");
  var v = stopHooks[0].validation;
  assert(v.exists === true, "script should exist | resolved=" + v.resolved + " | scriptPath=" + v.scriptPath + " | directCheck=" + fs.existsSync(scriptPath) + " | cmd=" + cmd);
});

check("validates $CLAUDE_PROJECT_DIR path", function() {
  // Create a script in the project dir
  var scriptPath = path.join(PROJECT_DIR, "myhook.py");
  fs.writeFileSync(scriptPath, "# test");
  var settings = {
    hooks: {
      Stop: [{
        hooks: [
          { command: 'python "$CLAUDE_PROJECT_DIR/myhook.py"', type: "command" }
        ]
      }]
    }
  };
  fs.writeFileSync(path.join(PROJECT_DIR, ".claude", "settings.json"), JSON.stringify(settings));
  var mod = loadMod();
  var result = mod.diagnose(PROJECT_DIR);
  var stopHooks = result.hooks.filter(function(h) { return h.event === "Stop" && h.scope === "project"; });
  assert(stopHooks.length === 1);
  assert(stopHooks[0].validation.exists === true, "CLAUDE_PROJECT_DIR script should exist");
});

check("detects missing $CLAUDE_PROJECT_DIR script", function() {
  var settings = {
    hooks: {
      PreToolUse: [{
        hooks: [
          { command: 'python "$CLAUDE_PROJECT_DIR/nonexistent.py"', type: "command" }
        ]
      }]
    }
  };
  fs.writeFileSync(path.join(PROJECT_DIR, ".claude", "settings.json"), JSON.stringify(settings));
  var mod = loadMod();
  var result = mod.diagnose(PROJECT_DIR);
  assert(result.broken.length > 0, "should detect missing script");
});

// === summary tests ===

check("summary counts are accurate", function() {
  var settings = {
    hooks: {
      PreToolUse: [{
        hooks: [
          { command: "echo ok", type: "command" },
          { command: 'node "/nonexistent/broken.js"', type: "command" }
        ]
      }],
      Stop: [{
        hooks: [
          { command: "echo bye", type: "command" }
        ]
      }]
    }
  };
  fs.writeFileSync(path.join(PROJECT_DIR, ".claude", "settings.json"), JSON.stringify(settings));
  var mod = loadMod();
  var result = mod.diagnose(PROJECT_DIR);
  // Count only project hooks for assertions
  var projectHooks = result.hooks.filter(function(h) { return h.scope === "project"; });
  assert(projectHooks.length === 3, "should have 3 project hooks, got " + projectHooks.length);
  var projectBroken = result.broken.filter(function(h) { return h.scope === "project"; });
  assert(projectBroken.length === 1, "should have 1 broken project hook");
  assert(result.summary.totalHooks >= 3, "summary totalHooks should be >= 3");
  assert(result.summary.brokenHooks >= 1, "summary brokenHooks should be >= 1");
});

// === edge cases ===

check("diagnose handles nonexistent project dir gracefully", function() {
  var mod = loadMod();
  var result = mod.diagnose(path.join(TMPDIR, "does-not-exist"));
  assert(result.summary, "should complete without crash");
  assert(result.settingsFiles.length > 0, "should still have user-global entries");
});

check("diagnose handles empty command", function() {
  var settings = {
    hooks: {
      Stop: [{
        hooks: [
          { command: "", type: "command" }
        ]
      }]
    }
  };
  fs.writeFileSync(path.join(PROJECT_DIR, ".claude", "settings.json"), JSON.stringify(settings));
  var mod = loadMod();
  var result = mod.diagnose(PROJECT_DIR);
  var emptyHooks = result.broken.filter(function(h) { return h.scope === "project" && h.command === ""; });
  assert(emptyHooks.length === 1, "empty command should be broken");
});

// Cleanup
cleanup();

// --- Summary ---
if (failures.length > 0) {
  console.log("\nFailed tests:");
  for (var fi = 0; fi < failures.length; fi++) console.log("  " + failures[fi]);
}
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);

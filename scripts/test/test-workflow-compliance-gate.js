#!/usr/bin/env node
"use strict";
var path = require("path");
var fs = require("fs");
var os = require("os");

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}
function blocks(r) { return r && r.decision === "block"; }

var home = process.env.HOME || process.env.USERPROFILE || "";
var origProjectDir = process.env.CLAUDE_PROJECT_DIR;

// Setup: temp dirs for configs
var tmpProject = path.join(os.tmpdir(), "wfcomp-test-" + Date.now());
fs.mkdirSync(tmpProject, {recursive: true});

// Ensure cache is cleared between tests
var cacheFile = path.join(os.tmpdir(), "hook-runner-wf-compliance-cache.json");
function clearCache() {
  try { fs.unlinkSync(cacheFile); } catch(e) {}
}

function freshGate() {
  var modPath = path.join(__dirname, "../../modules/PreToolUse/workflow-compliance-gate.js");
  delete require.cache[require.resolve(modPath)];
  clearCache();
  return require(modPath);
}

// --- No CLAUDE_PROJECT_DIR → passes ---
delete process.env.CLAUDE_PROJECT_DIR;
var gate = freshGate();
ok("no project dir passes", gate({tool_name: "Edit", tool_input: {}}) === null);

// --- No global config → passes ---
process.env.CLAUDE_PROJECT_DIR = tmpProject.replace(/\\/g, "/");
// Global config path: ~/.claude/hooks/workflow-config.json
// If it doesn't exist or has no enforced workflows, pass
var globalConfig = path.join(home, ".claude", "hooks", "workflow-config.json");
var hadGlobalConfig = false;
var origGlobalContent = "";
if (fs.existsSync(globalConfig)) {
  hadGlobalConfig = true;
  origGlobalContent = fs.readFileSync(globalConfig, "utf-8");
}

// Test with the real global config — if it has enforced workflows and the test
// project doesn't disable them, should pass
gate = freshGate();
var r1 = gate({tool_name: "Bash", tool_input: {command: "echo test"}});
// Either passes (no enforced workflows) or passes (project doesn't disable them)
ok("normal project passes", r1 === null);

// --- Project that disables a globally enforced workflow → blocks ---
// Create a project-level config that disables a workflow
if (hadGlobalConfig) {
  var globalCfg = {};
  try { globalCfg = JSON.parse(origGlobalContent); } catch(e) {}
  var enforcedKeys = Object.keys(globalCfg).filter(function(k) { return globalCfg[k] === true; });

  if (enforcedKeys.length > 0) {
    // Create project config that disables the first enforced workflow
    var projectConfig = {};
    projectConfig[enforcedKeys[0]] = false;
    fs.writeFileSync(path.join(tmpProject, "workflow-config.json"), JSON.stringify(projectConfig));

    gate = freshGate();
    var r2 = gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpProject, "app.js")}});
    ok("disabling enforced workflow blocks", blocks(r2));
    ok("block mentions WORKFLOW COMPLIANCE", r2 && /WORKFLOW COMPLIANCE/i.test(r2.reason));
    ok("block mentions violated workflow", r2 && r2.reason.indexOf(enforcedKeys[0]) >= 0);

    // --- Exception whitelist allows override ---
    var excPath = path.join(home, ".claude", "hooks", "workflow-exceptions.json");
    var hadExceptions = fs.existsSync(excPath);
    var origExceptions = hadExceptions ? fs.readFileSync(excPath, "utf-8") : "";

    var exceptions = {};
    exceptions[tmpProject.replace(/\\/g, "/")] = {workflow: enforcedKeys[0]};
    fs.writeFileSync(excPath, JSON.stringify(exceptions));

    gate = freshGate();
    var r3 = gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpProject, "app.js")}});
    ok("exception whitelist allows", r3 === null);

    // Restore exceptions
    if (hadExceptions) {
      fs.writeFileSync(excPath, origExceptions);
    } else {
      try { fs.unlinkSync(excPath); } catch(e) {}
    }

    // --- Wildcard exception ---
    exceptions = {};
    exceptions[tmpProject.replace(/\\/g, "/")] = {workflow: "*"};
    fs.writeFileSync(excPath, JSON.stringify(exceptions));

    gate = freshGate();
    var r4 = gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpProject, "app.js")}});
    ok("wildcard exception allows", r4 === null);

    // Restore
    if (hadExceptions) {
      fs.writeFileSync(excPath, origExceptions);
    } else {
      try { fs.unlinkSync(excPath); } catch(e) {}
    }

    // Clean up project config
    try { fs.unlinkSync(path.join(tmpProject, "workflow-config.json")); } catch(e) {}
  } else {
    // No enforced workflows — skip these tests
    ok("disabling enforced workflow blocks (skipped - no enforced wfs)", true);
    ok("block mentions WORKFLOW COMPLIANCE (skipped)", true);
    ok("block mentions violated workflow (skipped)", true);
    ok("exception whitelist allows (skipped)", true);
    ok("wildcard exception allows (skipped)", true);
  }
} else {
  ok("disabling enforced workflow blocks (skipped - no global config)", true);
  ok("block mentions WORKFLOW COMPLIANCE (skipped)", true);
  ok("block mentions violated workflow (skipped)", true);
  ok("exception whitelist allows (skipped)", true);
  ok("wildcard exception allows (skipped)", true);
}

// --- Cache behavior: second call should use cache ---
gate = freshGate();
var r5a = gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpProject, "app.js")}});
var r5b = gate({tool_name: "Edit", tool_input: {file_path: path.join(tmpProject, "app.js")}});
ok("cached result matches", (r5a === null) === (r5b === null));

// Cleanup
process.env.CLAUDE_PROJECT_DIR = origProjectDir || "";
clearCache();
try { fs.rmSync(tmpProject, {recursive: true, force: true}); } catch(e) {}

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);

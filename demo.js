#!/usr/bin/env node
"use strict";
/**
 * hook-runner demo — shows hook-runner in action without a live Claude Code session.
 *
 * Simulates PreToolUse gate checks against realistic scenarios:
 * - Dangerous commands that get blocked
 * - Normal commands that pass cleanly
 * - Workflow switching
 *
 * Usage: node setup.js --demo
 *        node demo.js
 *        node demo.js --fast     (skip typing animation)
 */

var fs = require("fs");
var path = require("path");
var VERSION = require(path.join(__dirname, "package.json")).version;

// ANSI colors
var C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
};

// Detect --fast flag
var fastMode = process.argv.indexOf("--fast") !== -1;

// Count available modules in this repo
function countModules() {
  var modDir = path.join(__dirname, "modules");
  var events = ["PreToolUse", "PostToolUse", "SessionStart", "Stop", "UserPromptSubmit"];
  var total = 0;
  for (var i = 0; i < events.length; i++) {
    var dir = path.join(modDir, events[i]);
    if (!fs.existsSync(dir)) continue;
    var files = fs.readdirSync(dir);
    for (var j = 0; j < files.length; j++) {
      var fp = path.join(dir, files[j]);
      try {
        var stat = fs.statSync(fp);
        if (stat.isFile() && files[j].slice(-3) === ".js" && files[j].charAt(0) !== "_") {
          total++;
        } else if (stat.isDirectory() && files[j].charAt(0) !== "_" && files[j] !== "archive") {
          var sub = fs.readdirSync(fp);
          for (var k = 0; k < sub.length; k++) {
            if (sub[k].slice(-3) === ".js") total++;
          }
        }
      } catch (e) { /* skip */ }
    }
  }
  return total;
}

// Count workflows
function countWorkflows() {
  var wfDir = path.join(__dirname, "workflows");
  if (!fs.existsSync(wfDir)) return 0;
  return fs.readdirSync(wfDir).filter(function(f) { return f.slice(-4) === ".yml"; }).length;
}

// Load actual modules for simulation
function loadModule(event, name) {
  var modPath = path.join(__dirname, "modules", event, name + ".js");
  if (!fs.existsSync(modPath)) return null;
  try { return require(modPath); } catch (e) { return null; }
}

// Sleep helper (synchronous, for typing effect)
function sleep(ms) {
  if (fastMode) return;
  var end = Date.now() + ms;
  while (Date.now() < end) { /* busy wait — ok for small delays in demo */ }
}

// Print with typing effect
function typeLine(text, delay) {
  if (fastMode || !delay) {
    process.stdout.write(text + "\n");
    return;
  }
  for (var i = 0; i < text.length; i++) {
    process.stdout.write(text.charAt(i));
    sleep(delay);
  }
  process.stdout.write("\n");
}

// Section divider
function divider() {
  console.log(C.dim + "─".repeat(70) + C.reset);
}

// Simulate a tool call and show the module's real response
function simulateCall(scenario) {
  console.log("");
  console.log(C.bold + C.cyan + "  Claude wants to run:" + C.reset);
  console.log(C.white + "  " + scenario.label + C.reset);
  console.log(C.dim + "  Tool: " + scenario.input.tool_name + C.reset);
  sleep(400);

  // Run the actual module
  var mod = loadModule(scenario.event, scenario.module);
  if (!mod) {
    console.log(C.yellow + "  [module not found: " + scenario.module + "]" + C.reset);
    return;
  }

  var start = Date.now();
  var result = null;
  try { result = mod(scenario.input); } catch (e) { result = null; }
  var elapsed = Date.now() - start;

  sleep(300);

  if (result && result.decision === "block") {
    console.log("");
    console.log(C.bgRed + C.white + C.bold + " BLOCKED " + C.reset + C.red + "  by " + scenario.module + C.dim + " (" + elapsed + "ms)" + C.reset);
    // Print block reason with indentation
    var lines = result.reason.split("\n");
    for (var i = 0; i < lines.length; i++) {
      console.log(C.red + "  " + lines[i] + C.reset);
    }
    console.log("");
    console.log(C.yellow + "  -> Claude reads this message and adjusts its approach." + C.reset);
  } else {
    console.log(C.bgGreen + C.white + C.bold + "  PASS  " + C.reset + C.green + "  " + scenario.module + C.dim + " (" + elapsed + "ms)" + C.reset);
  }
}

// ============================================================
// Demo scenarios
// ============================================================

var scenarios = [
  {
    title: "Scenario 1: Force push to main",
    description: "Claude tries to force-push to main after a messy rebase.",
    event: "PreToolUse",
    module: "force-push-gate",
    label: "git push --force origin main",
    input: {
      tool_name: "Bash",
      tool_input: { command: "git push --force origin main" }
    }
  },
  {
    title: "Scenario 2: Destructive git reset",
    description: "Claude wants to clean up — reaches for git reset --hard.",
    event: "PreToolUse",
    module: "git-destructive-guard",
    label: "git reset --hard HEAD~3",
    input: {
      tool_name: "Bash",
      tool_input: { command: "git reset --hard HEAD~3" }
    }
  },
  {
    title: "Scenario 3: Delete a directory",
    description: "Claude thinks old code should be removed.",
    event: "PreToolUse",
    module: "archive-not-delete",
    label: "rm -rf src/legacy/",
    input: {
      tool_name: "Bash",
      tool_input: { command: "rm -rf src/legacy/" }
    }
  },
  {
    title: "Scenario 4: Vague commit message",
    description: "Claude writes a commit message that says nothing useful.",
    event: "PreToolUse",
    module: "commit-quality-gate",
    label: 'git commit -m "fix stuff"',
    input: {
      tool_name: "Bash",
      tool_input: { command: 'git commit -m "fix stuff"' }
    }
  },
  {
    title: "Scenario 5: Normal push to feature branch",
    description: "Claude pushes to a feature branch — completely fine.",
    event: "PreToolUse",
    module: "force-push-gate",
    label: "git push origin feature/add-auth",
    input: {
      tool_name: "Bash",
      tool_input: { command: "git push origin feature/add-auth" }
    }
  },
  {
    title: "Scenario 6: Edit a source file",
    description: "Claude edits a JavaScript file — no Bash involved, gate skips instantly.",
    event: "PreToolUse",
    module: "force-push-gate",
    label: "Edit src/server.js (line 42)",
    input: {
      tool_name: "Edit",
      tool_input: { file_path: "src/server.js", old_string: "foo", new_string: "bar" }
    }
  },
];

// ============================================================
// Main
// ============================================================

function runDemo() {
  var moduleCount = countModules();
  var workflowCount = countWorkflows();

  console.log("");
  console.log(C.bold + C.blue + "  hook-runner v" + VERSION + " — Interactive Demo" + C.reset);
  console.log(C.dim + "  " + moduleCount + " modules | " + workflowCount + " workflows | 5 event types" + C.reset);
  console.log("");
  divider();
  console.log("");

  typeLine(C.bold + "  What is hook-runner?" + C.reset, 0);
  console.log("");
  console.log("  Claude Code hooks let you run scripts before/after every tool call.");
  console.log("  hook-runner turns this into a " + C.bold + "module system" + C.reset + " — drop a .js file in a");
  console.log("  folder, it runs automatically. " + C.bold + "Workflows" + C.reset + " group modules into pipelines.");
  console.log("");
  console.log("  When a module blocks an action, Claude reads the block reason and");
  console.log("  " + C.bold + "adjusts its approach" + C.reset + " — no human intervention needed.");
  console.log("");
  divider();
  console.log("");
  typeLine(C.bold + "  Let's see it in action." + C.reset, 0);
  console.log("  These scenarios use " + C.bold + "real modules" + C.reset + " from the starter workflow.");
  console.log("  Each module runs against simulated Claude tool calls.");

  sleep(800);

  // Run each scenario
  for (var i = 0; i < scenarios.length; i++) {
    var s = scenarios[i];
    console.log("");
    divider();
    console.log("");
    console.log(C.bold + C.magenta + "  " + s.title + C.reset);
    console.log(C.dim + "  " + s.description + C.reset);
    sleep(500);
    simulateCall(s);
    sleep(600);
  }

  // Summary
  console.log("");
  divider();
  console.log("");
  console.log(C.bold + "  How it works:" + C.reset);
  console.log("");
  console.log("  1. " + C.cyan + "Install" + C.reset + "       npx grobomo/hook-runner --yes");
  console.log("  2. " + C.cyan + "Modules run" + C.reset + "   Automatically on every tool call");
  console.log("  3. " + C.cyan + "Blocks fire" + C.reset + "   Claude sees the reason and self-corrects");
  console.log("  4. " + C.cyan + "Passes are silent" + C.reset + " — zero overhead on normal work");
  console.log("");
  console.log(C.bold + "  Workflows:" + C.reset);
  console.log("");
  console.log("  " + C.green + "starter" + C.reset + "  42 modules — safe defaults for any user");
  console.log("           Blocks: force push, destructive git, secret commits, rm -rf");
  console.log("           Adds: commit quality, test reminders, session context");
  console.log("");
  console.log("  " + C.yellow + "shtd" + C.reset + "     101 modules — spec-driven development discipline");
  console.log("           Adds: spec-first, test-first, PR workflow, code quality");
  console.log("");
  console.log("  " + C.yellow + "gsd" + C.reset + "      101 modules — phase-driven development discipline");
  console.log("           Like shtd but uses .planning/ phases instead of specs");
  console.log("");
  console.log(C.bold + "  Get started:" + C.reset);
  console.log("");
  console.log("  " + C.white + "npx grobomo/hook-runner --yes" + C.reset + "       # install + enable starter");
  console.log("  " + C.white + "node setup.js --workflow enable shtd" + C.reset + " # upgrade to full pipeline");
  console.log("  " + C.white + "node setup.js --health" + C.reset + "             # verify everything works");
  console.log("  " + C.white + "node setup.js --report --open" + C.reset + "      # visual HTML dashboard");
  console.log("");
  divider();
  console.log("");
}

module.exports = runDemo;

if (require.main === module) runDemo();

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
 *        node demo.js --html     (generate standalone HTML file)
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

// ============================================================
// HTML Export
// ============================================================

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function runScenarios() {
  var results = [];
  for (var i = 0; i < scenarios.length; i++) {
    var s = scenarios[i];
    var mod = loadModule(s.event, s.module);
    var result = null;
    var elapsed = 0;
    if (mod) {
      var start = Date.now();
      try { result = mod(s.input); } catch (e) { result = null; }
      elapsed = Date.now() - start;
    }
    results.push({
      title: s.title,
      description: s.description,
      label: s.label,
      tool: s.input.tool_name,
      module: s.module,
      blocked: !!(result && result.decision === "block"),
      reason: result && result.reason ? result.reason : "",
      elapsed: elapsed
    });
  }
  return results;
}

function generateHtml() {
  var moduleCount = countModules();
  var workflowCount = countWorkflows();
  var results = runScenarios();
  var blocked = results.filter(function(r) { return r.blocked; }).length;
  var passed = results.length - blocked;

  var html = [];
  html.push('<!DOCTYPE html>');
  html.push('<html lang="en"><head><meta charset="utf-8">');
  html.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  html.push('<title>hook-runner v' + escHtml(VERSION) + ' — Demo</title>');
  html.push('<style>');
  html.push(':root{--bg:#0d1117;--surface:#161b22;--border:#30363d;--text:#e6edf3;--dim:#8b949e;--red:#f85149;--green:#3fb950;--yellow:#d29922;--blue:#58a6ff;--cyan:#39d2c0;--magenta:#bc8cff;--code-bg:#1c2128}');
  html.push('*{margin:0;padding:0;box-sizing:border-box}');
  html.push('body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;line-height:1.6;padding:2rem;max-width:900px;margin:0 auto}');
  html.push('h1{color:var(--blue);font-size:1.8rem;margin-bottom:.25rem}');
  html.push('.subtitle{color:var(--dim);font-size:.95rem;margin-bottom:2rem}');
  html.push('.intro{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:1.5rem;margin-bottom:2rem}');
  html.push('.intro h2{font-size:1.1rem;margin-bottom:.75rem}');
  html.push('.intro p{color:var(--dim);margin-bottom:.5rem}');
  html.push('.intro strong{color:var(--text)}');
  html.push('.divider{border:0;border-top:1px solid var(--border);margin:1.5rem 0}');
  html.push('.scenario{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:1.5rem;margin-bottom:1rem;transition:border-color .2s}');
  html.push('.scenario:hover{border-color:var(--dim)}');
  html.push('.scenario-title{color:var(--magenta);font-weight:600;font-size:1.05rem}');
  html.push('.scenario-desc{color:var(--dim);font-size:.9rem;margin:.25rem 0 .75rem}');
  html.push('.command{font-family:"SF Mono",SFMono-Regular,Consolas,"Liberation Mono",Menlo,monospace;background:var(--code-bg);padding:.75rem 1rem;border-radius:6px;margin-bottom:.75rem}');
  html.push('.command-label{color:var(--cyan);font-weight:600;font-size:.85rem;margin-bottom:.25rem}');
  html.push('.command-text{color:var(--text);font-size:.95rem}');
  html.push('.command-tool{color:var(--dim);font-size:.8rem}');
  html.push('.result{display:inline-flex;align-items:center;gap:.5rem;padding:.35rem .75rem;border-radius:4px;font-weight:600;font-size:.9rem}');
  html.push('.result-blocked{background:rgba(248,81,73,.15);color:var(--red);border:1px solid rgba(248,81,73,.3)}');
  html.push('.result-pass{background:rgba(63,185,80,.15);color:var(--green);border:1px solid rgba(63,185,80,.3)}');
  html.push('.result-module{font-weight:400;color:var(--dim);font-size:.85rem}');
  html.push('.result-time{font-weight:400;color:var(--dim);font-size:.8rem}');
  html.push('.block-reason{background:rgba(248,81,73,.08);border-left:3px solid var(--red);padding:.75rem 1rem;margin-top:.75rem;border-radius:0 6px 6px 0;font-family:"SF Mono",SFMono-Regular,Consolas,monospace;font-size:.85rem;color:var(--red);white-space:pre-wrap;line-height:1.5}');
  html.push('.self-correct{color:var(--yellow);font-size:.85rem;margin-top:.5rem;font-style:italic}');
  html.push('.stats{display:flex;gap:1rem;margin-bottom:2rem;flex-wrap:wrap}');
  html.push('.stat{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:1rem 1.25rem;flex:1;min-width:120px;text-align:center}');
  html.push('.stat-value{font-size:1.8rem;font-weight:700}');
  html.push('.stat-label{color:var(--dim);font-size:.8rem;text-transform:uppercase;letter-spacing:.05em}');
  html.push('.how{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:1.5rem;margin-top:2rem}');
  html.push('.how h2{font-size:1.1rem;margin-bottom:1rem}');
  html.push('.how ol{padding-left:1.5rem;margin-bottom:1.5rem}');
  html.push('.how li{margin-bottom:.5rem;color:var(--dim)}');
  html.push('.how li strong{color:var(--cyan)}');
  html.push('.workflow{display:flex;gap:.75rem;align-items:baseline;margin-bottom:.75rem}');
  html.push('.wf-name{font-weight:700;min-width:70px}');
  html.push('.wf-starter{color:var(--green)}');
  html.push('.wf-advanced{color:var(--yellow)}');
  html.push('.wf-desc{color:var(--dim);font-size:.9rem}');
  html.push('.get-started{background:var(--code-bg);border-radius:6px;padding:1rem;margin-top:1rem;font-family:"SF Mono",SFMono-Regular,Consolas,monospace;font-size:.85rem;line-height:2}');
  html.push('.get-started .cmd{color:var(--text)}');
  html.push('.get-started .comment{color:var(--dim)}');
  html.push('.footer{text-align:center;color:var(--dim);font-size:.8rem;margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border)}');
  html.push('</style></head><body>');

  // Header
  html.push('<h1>hook-runner v' + escHtml(VERSION) + '</h1>');
  html.push('<p class="subtitle">' + moduleCount + ' modules &middot; ' + workflowCount + ' workflows &middot; 5 event types</p>');

  // Stats
  html.push('<div class="stats">');
  html.push('<div class="stat"><div class="stat-value" style="color:var(--blue)">' + results.length + '</div><div class="stat-label">Scenarios</div></div>');
  html.push('<div class="stat"><div class="stat-value" style="color:var(--red)">' + blocked + '</div><div class="stat-label">Blocked</div></div>');
  html.push('<div class="stat"><div class="stat-value" style="color:var(--green)">' + passed + '</div><div class="stat-label">Passed</div></div>');
  html.push('</div>');

  // Intro
  html.push('<div class="intro">');
  html.push('<h2>What is hook-runner?</h2>');
  html.push('<p>Claude Code hooks let you run scripts before/after every tool call. hook-runner turns this into a <strong>module system</strong> \u2014 drop a .js file in a folder, it runs automatically. <strong>Workflows</strong> group modules into pipelines.</p>');
  html.push('<p>When a module blocks an action, Claude reads the block reason and <strong>adjusts its approach</strong> \u2014 no human intervention needed.</p>');
  html.push('</div>');

  // Scenarios
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    html.push('<div class="scenario">');
    html.push('<div class="scenario-title">' + escHtml(r.title) + '</div>');
    html.push('<div class="scenario-desc">' + escHtml(r.description) + '</div>');
    html.push('<div class="command">');
    html.push('<div class="command-label">Claude wants to run:</div>');
    html.push('<div class="command-text">' + escHtml(r.label) + '</div>');
    html.push('<div class="command-tool">Tool: ' + escHtml(r.tool) + '</div>');
    html.push('</div>');
    if (r.blocked) {
      html.push('<span class="result result-blocked">BLOCKED</span>');
      html.push(' <span class="result-module">by ' + escHtml(r.module) + '</span>');
      html.push(' <span class="result-time">(' + r.elapsed + 'ms)</span>');
      html.push('<div class="block-reason">' + escHtml(r.reason) + '</div>');
      html.push('<div class="self-correct">\u2192 Claude reads this message and adjusts its approach.</div>');
    } else {
      html.push('<span class="result result-pass">PASS</span>');
      html.push(' <span class="result-module">' + escHtml(r.module) + '</span>');
      html.push(' <span class="result-time">(' + r.elapsed + 'ms)</span>');
    }
    html.push('</div>');
  }

  // How it works + workflows
  html.push('<div class="how">');
  html.push('<h2>How it works</h2>');
  html.push('<ol>');
  html.push('<li><strong>Install</strong> \u2014 <code>npx grobomo/hook-runner --yes</code></li>');
  html.push('<li><strong>Modules run</strong> \u2014 Automatically on every tool call</li>');
  html.push('<li><strong>Blocks fire</strong> \u2014 Claude sees the reason and self-corrects</li>');
  html.push('<li><strong>Passes are silent</strong> \u2014 zero overhead on normal work</li>');
  html.push('</ol>');
  html.push('<h2>Workflows</h2>');
  html.push('<div class="workflow"><span class="wf-name wf-starter">starter</span><span class="wf-desc">42 modules \u2014 safe defaults for any user. Blocks: force push, destructive git, secret commits, rm -rf</span></div>');
  html.push('<div class="workflow"><span class="wf-name wf-advanced">shtd</span><span class="wf-desc">101 modules \u2014 spec-driven development discipline. Adds: spec-first, test-first, PR workflow</span></div>');
  html.push('<div class="workflow"><span class="wf-name wf-advanced">gsd</span><span class="wf-desc">101 modules \u2014 phase-driven development discipline. Uses .planning/ phases instead of specs</span></div>');
  html.push('<h2 style="margin-top:1rem">Get started</h2>');
  html.push('<div class="get-started">');
  html.push('<span class="cmd">npx grobomo/hook-runner --yes</span> <span class="comment"># install + enable starter</span><br>');
  html.push('<span class="cmd">node setup.js --workflow enable shtd</span> <span class="comment"># upgrade to full pipeline</span><br>');
  html.push('<span class="cmd">node setup.js --health</span> <span class="comment"># verify everything works</span><br>');
  html.push('<span class="cmd">node setup.js --report --open</span> <span class="comment"># visual HTML dashboard</span>');
  html.push('</div>');
  html.push('</div>');

  // Footer
  html.push('<div class="footer">Generated by hook-runner v' + escHtml(VERSION) + ' on ' + new Date().toISOString().slice(0, 10) + '</div>');
  html.push('</body></html>');

  return html.join("\n");
}

function runHtmlDemo() {
  var os = require("os");
  var html = generateHtml();
  var outDir = path.join(os.homedir(), ".claude", "reports");
  try { fs.mkdirSync(outDir, { recursive: true }); } catch (e) {}
  var outPath = path.join(outDir, "hook-runner-demo.html");
  fs.writeFileSync(outPath, html);
  console.log("Demo HTML written to: " + outPath);

  // Open in browser
  try {
    var cp = require("child_process");
    var plat = process.platform;
    if (plat === "win32") cp.execSync('start "" "' + outPath + '"', { stdio: "ignore", shell: true });
    else if (plat === "darwin") cp.execSync('open "' + outPath + '"', { stdio: "ignore" });
    else cp.execSync('xdg-open "' + outPath + '"', { stdio: "ignore" });
  } catch (e) { /* browser open is best-effort */ }
}

module.exports = runDemo;
module.exports.generateHtml = generateHtml;
module.exports.runHtmlDemo = runHtmlDemo;

if (require.main === module) {
  if (process.argv.indexOf("--html") !== -1) runHtmlDemo();
  else runDemo();
}

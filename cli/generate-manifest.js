#!/usr/bin/env node
"use strict";
// T403a: Generate ENFORCEMENT.md — plain-English manifest of every active rule.
// Reads live modules, extracts WHY/WORKFLOW comments, cross-references hook-log
// block counts, and produces a human-readable document.
//
// Usage: node generate-manifest.js [--json]

var fs = require("fs");
var path = require("path");
var os = require("os");

var hooksDir = path.join(os.homedir(), ".claude", "hooks");
var modulesDir = path.join(hooksDir, "run-modules");
var logPath = path.join(hooksDir, "hook-log.jsonl");
var jsonMode = process.argv.indexOf("--json") !== -1;

// --- Read hook log for block/invocation counts ---
var blocks = {}, invocations = {}, lastBlock = {};
if (fs.existsSync(logPath)) {
  var lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
  for (var i = 0; i < lines.length; i++) {
    try {
      var e = JSON.parse(lines[i]);
      var mod = e.module;
      invocations[mod] = (invocations[mod] || 0) + 1;
      if (e.result === "block") {
        blocks[mod] = (blocks[mod] || 0) + 1;
        lastBlock[mod] = e.timestamp || e.ts || "";
      }
    } catch (x) {}
  }
}

// --- Read modules from each event ---
var EVENTS = ["PreToolUse", "PostToolUse", "SessionStart", "Stop", "UserPromptSubmit"];
var allModules = [];

for (var ei = 0; ei < EVENTS.length; ei++) {
  var evtDir = path.join(modulesDir, EVENTS[ei]);
  if (!fs.existsSync(evtDir)) continue;
  var files = fs.readdirSync(evtDir).filter(function (f) {
    return f.slice(-3) === ".js" && f.charAt(0) !== "_";
  });
  // Also check subdirs (project-scoped)
  var subdirs = fs.readdirSync(evtDir).filter(function (d) {
    var fp = path.join(evtDir, d);
    return fs.statSync(fp).isDirectory() && d !== "archive";
  });
  for (var si = 0; si < subdirs.length; si++) {
    var subFiles = fs.readdirSync(path.join(evtDir, subdirs[si])).filter(function (f) {
      return f.slice(-3) === ".js" && f.charAt(0) !== "_";
    });
    for (var sf = 0; sf < subFiles.length; sf++) {
      files.push(subdirs[si] + "/" + subFiles[sf]);
    }
  }

  for (var fi = 0; fi < files.length; fi++) {
    var filePath = path.join(evtDir, files[fi]);
    var name = files[fi].replace(/\.js$/, "");
    var baseName = path.basename(name);
    var src;
    try { src = fs.readFileSync(filePath, "utf-8"); } catch (x) { continue; }

    var whyMatch = src.match(/\/\/\s*WHY:\s*(.+(?:\n\/\/\s+.+)*)/);
    var why = whyMatch
      ? whyMatch[1].replace(/\n\/\/\s*/g, " ").trim()
      : "(no WHY comment)";

    var workflowMatch = src.match(/\/\/\s*WORKFLOW:\s*(.+)/);
    var workflow = workflowMatch ? workflowMatch[1].replace(/\s+$/, "") : "untagged";

    // Determine module role
    var role;
    if (EVENTS[ei] === "PreToolUse") {
      role = "gate";
    } else if (EVENTS[ei] === "PostToolUse") {
      role = "monitor";
    } else if (EVENTS[ei] === "SessionStart") {
      role = "setup";
    } else if (EVENTS[ei] === "Stop") {
      role = "cleanup";
    } else {
      role = "input-check";
    }

    // Determine verdict
    var blockCount = blocks[baseName] || 0;
    var invokeCount = invocations[baseName] || 0;
    var verdict;
    if (role !== "gate") {
      verdict = "observational";
    } else if (blockCount > 10) {
      verdict = "active";
    } else if (blockCount > 0) {
      verdict = "low-activity";
    } else if (invokeCount > 100) {
      verdict = "preventive";
    } else if (invokeCount === 0) {
      verdict = "unused";
    } else {
      verdict = "untested";
    }

    allModules.push({
      event: EVENTS[ei],
      name: name,
      why: why,
      workflow: workflow,
      role: role,
      blocks: blockCount,
      invocations: invokeCount,
      lastBlock: lastBlock[baseName] || null,
      verdict: verdict
    });
  }
}

if (jsonMode) {
  process.stdout.write(JSON.stringify(allModules, null, 2) + "\n");
  process.exit(0);
}

// --- Generate ENFORCEMENT.md ---
var out = [];
out.push("# Hook-Runner Enforcement Manifest");
out.push("");
out.push("Auto-generated: " + new Date().toISOString().slice(0, 10));
out.push("Run `node generate-manifest.js` to regenerate.");
out.push("");

// Summary stats
var gates = allModules.filter(function (m) { return m.role === "gate"; });
var activeGates = gates.filter(function (m) { return m.verdict === "active"; });
var lowActivity = gates.filter(function (m) { return m.verdict === "low-activity"; });
var preventiveGates = gates.filter(function (m) { return m.verdict === "preventive"; });
var unusedGates = gates.filter(function (m) { return m.verdict === "unused" || m.verdict === "untested"; });
var monitors = allModules.filter(function (m) { return m.role !== "gate"; });

out.push("## Summary");
out.push("");
out.push("| Category | Count | Description |");
out.push("|----------|-------|-------------|");
out.push("| Active gates | " + activeGates.length + " | Blocked 10+ times — proven enforcement |");
out.push("| Low-activity gates | " + lowActivity.length + " | Blocked 1-10 times — edge cases |");
out.push("| Preventive gates | " + preventiveGates.length + " | Loaded 100+ times, never blocked — deterrent |");
out.push("| Unused/untested gates | " + unusedGates.length + " | Candidates for removal |");
out.push("| Monitors/setup/cleanup | " + monitors.length + " | Non-blocking, observational |");
out.push("| **Total** | **" + allModules.length + "** | |");
out.push("");

// Active gates
out.push("## Active Gates");
out.push("");
out.push("These rules block regularly. They are the core enforcement layer.");
out.push("");
var sorted = activeGates.slice().sort(function (a, b) { return b.blocks - a.blocks; });
for (var ai = 0; ai < sorted.length; ai++) {
  var g = sorted[ai];
  out.push("### " + g.name);
  out.push("**Why:** " + g.why);
  out.push("**Blocks:** " + g.blocks + " / " + g.invocations + " invocations");
  if (g.lastBlock) out.push("**Last block:** " + g.lastBlock);
  out.push("");
}

// Low-activity
out.push("## Low-Activity Gates");
out.push("");
for (var li = 0; li < gates.length; li++) {
  if (gates[li].verdict !== "low-activity") continue;
  out.push("- **" + gates[li].name + "** — " + gates[li].why + " (" + gates[li].blocks + " blocks)");
}
out.push("");

// Preventive
out.push("## Preventive Gates");
out.push("");
out.push("Run on every tool call but never blocked. Either working as deterrents or unnecessary.");
out.push("");
for (var pi = 0; pi < gates.length; pi++) {
  if (gates[pi].verdict !== "preventive") continue;
  out.push("- **" + gates[pi].name + "** — " + gates[pi].why);
}
out.push("");

// Unused
if (unusedGates.length > 0) {
  out.push("## Unused/Untested Gates — Candidates for Removal");
  out.push("");
  for (var ui = 0; ui < unusedGates.length; ui++) {
    var ug = unusedGates[ui];
    out.push("- **" + ug.name + "** (" + ug.verdict + ") — " + ug.why + " (" + ug.invocations + " invocations)");
  }
  out.push("");
}

// Monitors (compact table)
out.push("## Monitors & Setup (non-blocking)");
out.push("");
out.push("| Event | Module | Purpose |");
out.push("|-------|--------|---------|");
for (var mi = 0; mi < monitors.length; mi++) {
  var mon = monitors[mi];
  var purpose = mon.why.length > 80 ? mon.why.slice(0, 77) + "..." : mon.why;
  out.push("| " + mon.event + " | " + mon.name + " | " + purpose + " |");
}
out.push("");

var content = out.join("\n") + "\n";
var outputPath = path.join(__dirname, "ENFORCEMENT.md");
fs.writeFileSync(outputPath, content);
console.log("Generated " + outputPath);
console.log("  " + gates.length + " gates (" + activeGates.length + " active, " + lowActivity.length + " low-activity, " + preventiveGates.length + " preventive, " + unusedGates.length + " unused)");
console.log("  " + monitors.length + " monitors/setup/cleanup");

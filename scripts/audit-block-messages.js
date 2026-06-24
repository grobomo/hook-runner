#!/usr/bin/env node
"use strict";
// T736: Audit gate block messages for WHY + NEXT STEPS compliance
// Usage: node scripts/audit-block-messages.js [--live] [--json]
//
// Scans all gate modules for block reason strings.
// Reports which gates are compliant (have WHY + NEXT STEPS) vs non-compliant.

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || "/home/ubu";
var REPO_DIR = path.join(__dirname, "..");
var LIVE_DIR = path.join(HOME, ".claude", "hooks", "run-modules");

var args = process.argv.slice(2);
var jsonMode = args.indexOf("--json") !== -1;
var liveMode = args.indexOf("--live") !== -1;

var scanDir = liveMode ? LIVE_DIR : path.join(REPO_DIR, "modules");

function findGates(dir) {
  var results = [];
  try {
    var entries = fs.readdirSync(dir, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith("_") || entry.name === "node_modules") continue;
        results = results.concat(findGates(fullPath));
      } else if (entry.name.endsWith(".js") && !entry.name.startsWith("_")) {
        results.push(fullPath);
      }
    }
  } catch (e) {}
  return results;
}

function extractReasons(filePath) {
  var content;
  try { content = fs.readFileSync(filePath, "utf-8"); } catch (e) { return []; }
  if (!/decision.*block|decision:\s*["']block/i.test(content)) return [];

  var reasons = [];
  var lines = content.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!/reason\s*:/.test(line)) continue;
    // Skip log/logEntry calls — they're not user-facing block messages
    if (/\blog\s*\(|logEntry\s*\(|hookLog\.|_log\s*\(/.test(line)) continue;

    // Collect full reason by following string concatenation
    var full = "";
    for (var j = i; j < Math.min(i + 20, lines.length); j++) {
      var strMatches = lines[j].match(/["']([^"']*(?:\\.[^"']*)*)["']/g);
      if (strMatches) {
        for (var s = 0; s < strMatches.length; s++) {
          full += strMatches[s].slice(1, -1);
        }
      }
      // Template literal
      var tmpl = lines[j].match(/`([^`]*)`/);
      if (tmpl && j === i) { full = tmpl[1].replace(/\$\{[^}]+\}/g, "..."); break; }
      // Stop if no continuation
      if (j > i && !/[+,]$/.test(lines[j].trim()) && !/^\s*["'+`]/.test(lines[j + 1] || "")) break;
    }
    if (full) {
      reasons.push({ line: i + 1, text: full.replace(/\\n/g, "\n").trim() });
    }
  }
  return reasons;
}

function isCompliant(reasonText) {
  var isSelfCheck = /SELF-CHECK\s*\[/i.test(reasonText);
  if (isSelfCheck) return true;
  var hasWhy = /WHY:/i.test(reasonText);
  var hasNextSteps = /NEXT STEPS:|NEXT:|DO THIS:|FIX:|Instead:|1\./i.test(reasonText);
  return hasWhy && hasNextSteps;
}

function hasFalsePositive(reasonText) {
  return /FALSE POSITIVE\?/i.test(reasonText);
}

// Also check the full file content for FALSE POSITIVE (covers variable-based reasons)
function fileHasFalsePositive(filePath) {
  try {
    var content = fs.readFileSync(filePath, "utf-8");
    return /FALSE POSITIVE\?/i.test(content);
  } catch (e) { return false; }
}

var gates = findGates(scanDir);
var compliant = [];
var nonCompliant = [];
var noBlocks = [];

for (var g = 0; g < gates.length; g++) {
  var gatePath = gates[g];
  var gateName = path.basename(gatePath, ".js");
  var relPath = path.relative(scanDir, gatePath);
  var reasons = extractReasons(gatePath);

  if (reasons.length === 0) {
    noBlocks.push(gateName);
    continue;
  }

  var gateCompliant = true;
  var badReasons = [];
  for (var r = 0; r < reasons.length; r++) {
    if (!isCompliant(reasons[r].text)) {
      gateCompliant = false;
      badReasons.push(reasons[r]);
    }
  }

  var hasFP = fileHasFalsePositive(gatePath);
  if (gateCompliant) {
    compliant.push({ name: gateName, path: relPath, reasons: reasons.length, hasFP: hasFP });
  } else {
    nonCompliant.push({ name: gateName, path: relPath, total: reasons.length, bad: badReasons, hasFP: hasFP });
  }
}

var fpCount = compliant.filter(function(g) { return g.hasFP; }).length +
  nonCompliant.filter(function(g) { return g.hasFP; }).length;
var totalWithBlocks = compliant.length + nonCompliant.length;

if (jsonMode) {
  console.log(JSON.stringify({
    scanned: gates.length,
    withBlocks: totalWithBlocks,
    compliant: compliant.length,
    nonCompliant: nonCompliant.length,
    noBlocks: noBlocks.length,
    falsePositiveEscapeHatch: fpCount,
    missingFalsePositive: totalWithBlocks - fpCount,
    nonCompliantGates: nonCompliant.map(function(g) {
      return { name: g.name, path: g.path, badCount: g.bad.length, totalReasons: g.total, hasFP: g.hasFP };
    }),
    compliantGates: compliant.map(function(g) { return g.name; })
  }, null, 2));
} else {
  console.log("=== Gate Block Message Audit (T736) ===");
  console.log("Scanning: " + scanDir);
  console.log("Total gate files: " + gates.length);
  console.log("Gates with blocks: " + (compliant.length + nonCompliant.length));
  console.log("  Compliant (WHY + NEXT STEPS): " + compliant.length);
  console.log("  Non-compliant: " + nonCompliant.length);
  console.log("  FALSE POSITIVE escape hatch: " + fpCount + "/" + totalWithBlocks);
  console.log("No block statements: " + noBlocks.length);
  console.log("");

  if (nonCompliant.length > 0) {
    console.log("--- NON-COMPLIANT (" + nonCompliant.length + " gates) ---");
    for (var nc = 0; nc < nonCompliant.length; nc++) {
      var gate = nonCompliant[nc];
      console.log("  " + gate.path + " (" + gate.bad.length + "/" + gate.total + " reasons)");
      for (var br = 0; br < Math.min(gate.bad.length, 2); br++) {
        var reason = gate.bad[br];
        console.log("    L" + reason.line + ": " + reason.text.slice(0, 80) + (reason.text.length > 80 ? "..." : ""));
      }
    }
  }

  if (compliant.length > 0) {
    console.log("\n--- COMPLIANT (" + compliant.length + " gates) ---");
    console.log("  " + compliant.map(function(g) { return g.name; }).join(", "));
  }

  console.log("\nTo fix: add WHY: and NEXT STEPS: to each block reason string.");
  console.log("Standard format:");
  console.log("  BLOCKED: {what}");
  console.log("  WHY: {incident/failure prevented}");
  console.log("  NEXT STEPS: 1. {action} 2. {action}");
}

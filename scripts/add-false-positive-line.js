#!/usr/bin/env node
"use strict";
// T780: Add FALSE POSITIVE escape hatch to all gate block messages
// Usage: node scripts/add-false-positive-line.js [--dry-run] [--gate name] [--verbose]
//
// Scans all gate modules for block reason strings and appends:
//   FALSE POSITIVE? File a TODO in hook-runner: "Fix {gate-name} — {describe the issue}"
// Skips gates that already have the line.

var fs = require("fs");
var path = require("path");

var REPO_DIR = path.join(__dirname, "..");
var MODULES_DIR = path.join(REPO_DIR, "modules");

var args = process.argv.slice(2);
var dryRun = args.indexOf("--dry-run") !== -1;
var verboseMode = args.indexOf("--verbose") !== -1;
var gateIdx = args.indexOf("--gate");
var gateFilter = gateIdx !== -1 ? args[gateIdx + 1] : null;

// Skip these directories
var SKIP_DIRS = ["archive", "_disabled", "_openclaw", "_example-project", "node_modules",
  "llm-token-tracker", "1-haiku", "2-mechanical"];

function findGates(dir) {
  var results = [];
  try {
    var entries = fs.readdirSync(dir, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.indexOf(entry.name) !== -1) continue;
        results = results.concat(findGates(fullPath));
      } else if (entry.name.endsWith(".js") && !entry.name.startsWith("_")) {
        results.push(fullPath);
      }
    }
  } catch (e) {}
  return results;
}

function hasBlockDecision(content) {
  return /decision\s*:\s*["']block["']/.test(content);
}

function hasFalsePositiveLine(content) {
  return /FALSE POSITIVE\?/i.test(content);
}

// Build the FALSE POSITIVE line for a given gate name
function fpLine(gateName) {
  return 'FALSE POSITIVE? File a TODO in hook-runner: "Fix ' + gateName + ' — {describe the issue}"';
}

// Process a single gate file
function processGate(gatePath) {
  var gateName = path.basename(gatePath, ".js");
  var content = fs.readFileSync(gatePath, "utf-8");

  if (!hasBlockDecision(content)) return { status: "no-blocks" };
  if (hasFalsePositiveLine(content)) return { status: "already-has-fp" };

  var lines = content.split("\n");
  var modified = false;
  var fixCount = 0;
  var fp = fpLine(gateName);

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // Find reason: lines that are part of block decisions
    if (!/reason\s*:/.test(line)) continue;
    // Skip logging calls
    if (/\blog\s*\(|logEntry\s*\(|hookLog\.|_log\s*\(/.test(line)) continue;
    // Skip comments
    if (/^\s*\/\//.test(line)) continue;

    // Strategy 1: Single-line reason: "..." — append \n + FP before closing quote
    var singleQuoteMatch = line.match(/^(.*reason\s*:\s*)"((?:[^"\\]|\\.)*)"(.*)$/);
    if (singleQuoteMatch) {
      var prefix = singleQuoteMatch[1];
      var reasonText = singleQuoteMatch[2];
      var suffix = singleQuoteMatch[3];
      if (/FALSE POSITIVE/i.test(reasonText)) continue;
      lines[i] = prefix + '"' + reasonText + '\\n' + fp.replace(/"/g, '\\"') + '"' + suffix;
      modified = true;
      fixCount++;
      if (verboseMode) console.log("  Fixed L" + (i + 1) + " (double-quote single-line)");
      continue;
    }

    // Strategy 1b: reason: 'text' (single quotes)
    var singleQuoteMatch2 = line.match(/^(.*reason\s*:\s*)'((?:[^'\\]|\\.)*)'(.*)$/);
    if (singleQuoteMatch2) {
      var prefix2 = singleQuoteMatch2[1];
      var reasonText2 = singleQuoteMatch2[2];
      var suffix2 = singleQuoteMatch2[3];
      if (/FALSE POSITIVE/i.test(reasonText2)) continue;
      // Convert to double-quote to avoid escaping issues
      lines[i] = prefix2 + '"' + reasonText2.replace(/"/g, '\\"') + '\\n' + fp.replace(/"/g, '\\"') + '"' + suffix2;
      modified = true;
      fixCount++;
      if (verboseMode) console.log("  Fixed L" + (i + 1) + " (single-quote single-line)");
      continue;
    }

    // Strategy 2: Template literal reason: `text`
    var tmplMatch = line.match(/^(.*reason\s*:\s*)`([^`]*)`(.*)$/);
    if (tmplMatch) {
      var tPrefix = tmplMatch[1];
      var tText = tmplMatch[2];
      var tSuffix = tmplMatch[3];
      if (/FALSE POSITIVE/i.test(tText)) continue;
      lines[i] = tPrefix + '`' + tText + '\n' + fp + '`' + tSuffix;
      modified = true;
      fixCount++;
      if (verboseMode) console.log("  Fixed L" + (i + 1) + " (template literal)");
      continue;
    }

    // Strategy 3: Multi-line string concatenation — find the last line of the reason
    // Look for lines ending with + "text" or continuation patterns
    var lastReasonLine = i;
    for (var j = i + 1; j < Math.min(i + 30, lines.length); j++) {
      var prevTrimmed = lines[j - 1].trimEnd();
      var currTrimmed = lines[j].trim();
      // Continuation: prev ends with + or , or curr starts with " or + or `
      if (/[+]$/.test(prevTrimmed) || /^["'+]/.test(currTrimmed)) {
        lastReasonLine = j;
      } else {
        break;
      }
    }

    if (lastReasonLine > i) {
      // Multi-line: modify the last line to append FP before closing quote
      var lastLine = lines[lastReasonLine];
      // Find the last quote on the last line
      var lastDoubleQuote = lastLine.lastIndexOf('"');
      var lastSingleQuote = lastLine.lastIndexOf("'");
      var quotePos = Math.max(lastDoubleQuote, lastSingleQuote);
      if (quotePos > 0) {
        var quoteChar = lastLine[quotePos];
        var before = lastLine.substring(0, quotePos);
        var after = lastLine.substring(quotePos);
        if (!/FALSE POSITIVE/i.test(before)) {
          var escapedFp = fp.replace(/"/g, '\\"');
          lines[lastReasonLine] = before + "\\n" + escapedFp + after;
          modified = true;
          fixCount++;
          if (verboseMode) console.log("  Fixed L" + (i + 1) + "-L" + (lastReasonLine + 1) + " (multi-line concat)");
        }
      }
      i = lastReasonLine; // Skip past the multi-line block
      continue;
    }
  }

  if (!modified) return { status: "no-fixable-reasons", fixCount: 0 };

  // Verify syntax
  var cp = require("child_process");
  var tmpFile = path.join(require("os").tmpdir(), "fp-verify-" + process.pid + ".js");
  var newContent = lines.join("\n");
  fs.writeFileSync(tmpFile, newContent);
  try {
    cp.execSync("node -c " + JSON.stringify(tmpFile), { encoding: "utf-8", windowsHide: true });
    try { fs.unlinkSync(tmpFile); } catch (e) {}
    if (!dryRun) {
      fs.writeFileSync(gatePath, newContent);
    }
    return { status: "fixed", fixCount: fixCount };
  } catch (e) {
    try { fs.unlinkSync(tmpFile); } catch (e2) {}
    return { status: "syntax-error", fixCount: fixCount, error: e.message };
  }
}

// Main
console.log("=== T780: Add FALSE POSITIVE escape hatch ===");
console.log("Mode: " + (dryRun ? "DRY RUN" : "LIVE EDIT"));
if (gateFilter) console.log("Filter: " + gateFilter);
console.log("");

var gates = findGates(MODULES_DIR);
var stats = { fixed: 0, alreadyHas: 0, noBlocks: 0, syntaxError: 0, noFixable: 0, totalReasons: 0 };
var errors = [];

for (var g = 0; g < gates.length; g++) {
  var gatePath = gates[g];
  var gateName = path.basename(gatePath, ".js");
  var relPath = path.relative(MODULES_DIR, gatePath);

  if (gateFilter && gateName !== gateFilter) continue;

  var result = processGate(gatePath);

  switch (result.status) {
    case "no-blocks":
      stats.noBlocks++;
      break;
    case "already-has-fp":
      stats.alreadyHas++;
      if (verboseMode) console.log("SKIP (already has FP): " + relPath);
      break;
    case "fixed":
      stats.fixed++;
      stats.totalReasons += result.fixCount;
      console.log((dryRun ? "[DRY] " : "") + "FIXED: " + relPath + " (" + result.fixCount + " reasons)");
      break;
    case "syntax-error":
      stats.syntaxError++;
      errors.push(relPath);
      console.log("SYNTAX ERROR: " + relPath);
      if (verboseMode) console.log("  " + result.error);
      break;
    case "no-fixable-reasons":
      stats.noFixable++;
      if (verboseMode) console.log("SKIP (no fixable patterns): " + relPath);
      break;
  }
}

console.log("\n=== Summary ===");
console.log("Gates scanned: " + gates.length);
console.log("Fixed: " + stats.fixed + " gates (" + stats.totalReasons + " reason strings)");
console.log("Already had FP: " + stats.alreadyHas);
console.log("No block statements: " + stats.noBlocks);
console.log("No fixable patterns: " + stats.noFixable);
console.log("Syntax errors: " + stats.syntaxError);
if (errors.length > 0) {
  console.log("\nFailed gates:");
  for (var e = 0; e < errors.length; e++) {
    console.log("  " + errors[e]);
  }
}

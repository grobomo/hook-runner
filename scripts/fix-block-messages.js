#!/usr/bin/env node
"use strict";
// T736: Auto-fix gate block messages to include WHY + NEXT STEPS
// Usage: node scripts/fix-block-messages.js [--dry-run] [--limit N] [--gate name]
//
// Reads each non-compliant gate, calls Haiku to generate improved messages,
// applies edits, verifies syntax.

var fs = require("fs");
var path = require("path");
var cp = require("child_process");

var HOME = process.env.HOME || process.env.USERPROFILE || "/home/ubu";
var REPO_DIR = path.join(__dirname, "..");
var MODULES_DIR = path.join(REPO_DIR, "modules");
var PROXY_PORT = 4100;

var args = process.argv.slice(2);
var dryRun = args.indexOf("--dry-run") !== -1;
var limitIdx = args.indexOf("--limit");
var limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) || 5 : 999;
var gateIdx = args.indexOf("--gate");
var gateFilter = gateIdx !== -1 ? args[gateIdx + 1] : null;
var verboseMode = args.indexOf("--verbose") !== -1;

// Skip these directories — project-specific or archived
var SKIP_DIRS = ["archive", "_disabled", "_openclaw", "_example-project",
  "ep-incident-response", "hackathon26", "ddei-email-security"];

function findGates(dir) {
  var results = [];
  try {
    var entries = fs.readdirSync(dir, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith("_") && entry.name !== "_disabled") {
          // Allow underscore dirs only if explicitly in skip list
        }
        if (SKIP_DIRS.indexOf(entry.name) !== -1 || entry.name === "node_modules") continue;
        results = results.concat(findGates(fullPath));
      } else if (entry.name.endsWith(".js") && !entry.name.startsWith("_")) {
        results.push(fullPath);
      }
    }
  } catch (e) {}
  return results;
}

function extractWhyComment(content) {
  var match = content.match(/\/\/\s*WHY:\s*(.*)/);
  return match ? match[1].trim() : "";
}

function isCompliant(reasonText) {
  var isSelfCheck = /SELF-CHECK\s*\[/i.test(reasonText);
  if (isSelfCheck) return true;
  var hasWhy = /WHY:/i.test(reasonText);
  var hasNextSteps = /NEXT STEPS:|NEXT:|DO THIS:|FIX:|Instead:|1\./i.test(reasonText);
  return hasWhy && hasNextSteps;
}

// Find block reason strings and their exact locations
function findBlockReasons(content) {
  var results = [];
  var lines = content.split("\n");

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!/reason\s*:/.test(line)) continue;
    // Skip logging calls
    if (/\blog\s*\(|logEntry\s*\(|hookLog\.|_log\s*\(/.test(line)) continue;
    // Skip comments
    if (/^\s*\/\//.test(line)) continue;

    // Extract reason value — simple string or template literal
    // Pattern 1: reason: "text" or reason: 'text'
    var simpleMatch = line.match(/reason\s*:\s*["']([^"']+)["']/);
    if (simpleMatch) {
      var text = simpleMatch[1];
      if (!isCompliant(text)) {
        results.push({ line: i + 1, text: text, type: "simple", raw: line });
      }
      continue;
    }

    // Pattern 2: reason: `template literal`
    var tmplMatch = line.match(/reason\s*:\s*`([^`]+)`/);
    if (tmplMatch) {
      var text2 = tmplMatch[1].replace(/\$\{[^}]+\}/g, "...");
      if (!isCompliant(text2)) {
        results.push({ line: i + 1, text: text2, type: "template", raw: line });
      }
      continue;
    }

    // Pattern 3: multi-line reason (string concatenation)
    // Collect the full reason across lines
    var fullReason = "";
    var startLine = i;
    var endLine = i;
    var hasVars = false;
    for (var j = i; j < Math.min(i + 25, lines.length); j++) {
      var strMatches = lines[j].match(/["']([^"']*(?:\\.[^"']*)*)["']/g);
      if (strMatches) {
        for (var s = 0; s < strMatches.length; s++) {
          fullReason += strMatches[s].slice(1, -1);
        }
      }
      // Check for variable refs
      if (/\+\s*\w+|[^\\]\$\{/.test(lines[j])) hasVars = true;
      endLine = j;
      // Stop if no continuation
      if (j > i && !/[+,]$/.test(lines[j].trim()) && !/^\s*["'+`]/.test(lines[j + 1] || "")) break;
    }
    if (fullReason && !isCompliant(fullReason.replace(/\\n/g, "\n"))) {
      results.push({
        line: startLine + 1,
        endLine: endLine + 1,
        text: fullReason.replace(/\\n/g, "\n").trim(),
        type: hasVars ? "complex" : "multi",
        raw: lines.slice(startLine, endLine + 1).join("\n")
      });
    }
  }
  return results;
}

function getAuthToken() {
  if (process.env.ANTHROPIC_AUTH_TOKEN) return process.env.ANTHROPIC_AUTH_TOKEN;
  if (process.env.LLM_PROXY_AUTH) return process.env.LLM_PROXY_AUTH;
  try {
    var settingsPath = path.join(HOME, ".claude", "settings.json");
    var settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    if (settings.env && settings.env.ANTHROPIC_AUTH_TOKEN) return settings.env.ANTHROPIC_AUTH_TOKEN;
    if (settings.env && settings.env.LLM_PROXY_AUTH) return settings.env.LLM_PROXY_AUTH;
  } catch (e) {}
  return "";
}

function callHaiku(prompt, maxTokens) {
  maxTokens = maxTokens || 400;
  var token = getAuthToken();

  var payload = JSON.stringify({
    model: "claude-haiku-4-5",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }]
  });

  // Write payload to temp file (avoid shell escaping issues on Windows)
  var tmpFile = path.join(require("os").tmpdir(), "haiku-fix-" + process.pid + ".json");
  fs.writeFileSync(tmpFile, payload);

  try {
    var result = cp.execSync(
      'curl -s -X POST http://localhost:' + PROXY_PORT + '/v1/chat/completions ' +
      '-H "Content-Type: application/json" ' +
      '-H "Authorization: Bearer ' + token + '" ' +
      '-d @"' + tmpFile.replace(/\\/g, "/") + '"',
      { timeout: 15000, encoding: "utf-8", windowsHide: true }
    );
    try { fs.unlinkSync(tmpFile); } catch (e) {}

    var parsed = JSON.parse(result);
    if (parsed.choices && parsed.choices[0]) {
      return parsed.choices[0].message.content.trim();
    }
    if (verboseMode && parsed.error) console.error("  Haiku API error:", parsed.error);
    return null;
  } catch (e) {
    try { fs.unlinkSync(tmpFile); } catch (e2) {}
    if (verboseMode) console.error("  Haiku error:", e.message);
    return null;
  }
}

function generateImprovedMessage(gateName, whyComment, currentReason) {
  var prompt = 'You are improving a gate block message for a Claude Code hook system.\n\n' +
    'Gate name: ' + gateName + '\n' +
    'WHY comment (explains what incident caused this gate): ' + (whyComment || "(none)") + '\n' +
    'Current block message:\n' + currentReason + '\n\n' +
    'Rewrite ONLY the block message text (no code, no quotes) in this exact format:\n\n' +
    'BLOCKED: {one-line description of what was blocked}\n' +
    'WHY: {one sentence explaining the real incident or failure this prevents}\n' +
    'NEXT STEPS:\n' +
    '1. {first action}\n' +
    '2. {second action if needed}\n\n' +
    'Rules:\n' +
    '- Keep any existing useful content from the current message\n' +
    '- WHY must reference a real problem, not just restate the block\n' +
    '- NEXT STEPS must be actionable (commands, files to edit, alternatives)\n' +
    '- Keep it concise — max 5 lines total\n' +
    '- Do NOT include variable placeholders like ${x} — I will add those back\n' +
    '- Do NOT wrap in quotes or code blocks\n' +
    '- Do NOT use contractions (can\'t, don\'t, won\'t) — use full words (cannot, do not, will not)\n' +
    '- Do NOT use apostrophes or single quotes in the text\n' +
    '- If the current message already has good content, just restructure it';

  return callHaiku(prompt, 300);
}

// Main
console.log("=== T736: Auto-fix block messages ===");
console.log("Mode: " + (dryRun ? "DRY RUN" : "LIVE EDIT"));
console.log("Limit: " + limit);
if (gateFilter) console.log("Filter: " + gateFilter);
console.log("");

var gates = findGates(MODULES_DIR);
var fixed = 0;
var skipped = 0;
var errors = 0;

for (var g = 0; g < gates.length && fixed < limit; g++) {
  var gatePath = gates[g];
  var gateName = path.basename(gatePath, ".js");
  var relPath = path.relative(MODULES_DIR, gatePath);

  if (gateFilter && gateName !== gateFilter) continue;

  var content = fs.readFileSync(gatePath, "utf-8");
  var whyComment = extractWhyComment(content);
  var reasons = findBlockReasons(content);

  if (reasons.length === 0) continue;

  var nonCompliantReasons = reasons.filter(function(r) { return r.type !== "complex"; });
  if (nonCompliantReasons.length === 0) {
    if (reasons.length > 0) {
      skipped++;
      if (verboseMode) console.log("SKIP (complex): " + relPath);
    }
    continue;
  }

  console.log("FIX: " + relPath + " (" + nonCompliantReasons.length + " reasons, WHY: " + (whyComment || "none") + ")");

  var fileModified = false;
  var newContent = content;

  for (var r = 0; r < nonCompliantReasons.length; r++) {
    var reason = nonCompliantReasons[r];
    if (verboseMode) console.log("  Reason L" + reason.line + " (" + reason.type + "): " + reason.text.slice(0, 60) + "...");

    var improved = generateImprovedMessage(gateName, whyComment, reason.text);
    if (!improved) {
      console.log("  SKIP: Haiku unavailable for L" + reason.line);
      errors++;
      continue;
    }

    // Clean up Haiku response — remove any markdown fences
    improved = improved.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim();

    if (verboseMode) console.log("  Improved: " + improved.slice(0, 80) + "...");

    if (dryRun) {
      console.log("  [DRY] L" + reason.line + ": would replace with:");
      console.log("    " + improved.split("\n").join("\n    "));
      fixed++;
      continue;
    }

    // Strategy: find the reason line and all continuation lines, replace with single-line reason
    var escaped = improved.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

    // Work with the file as lines
    var contentLines = newContent.split("\n");
    var startIdx = reason.line - 1; // 0-indexed
    var endIdx = startIdx;

    // Find the extent of this reason value (continuation lines end with + or string start)
    for (var j = startIdx + 1; j < contentLines.length; j++) {
      var prevTrimmed = contentLines[j - 1].trimEnd();
      var currTrimmed = contentLines[j].trim();
      // Continuation: prev ends with + or curr starts with " or + or `
      if (/[+,]$/.test(prevTrimmed) || /^["'`+]/.test(currTrimmed)) {
        endIdx = j;
      } else {
        break;
      }
    }

    // Extract everything before "reason:" as the prefix, everything after the value as the suffix
    var reasonLine = contentLines[startIdx];
    // Match: anything before reason:, the reason: itself, then the value, then any closing }); etc.
    var prefixMatch = reasonLine.match(/^(.*reason\s*:\s*)/);
    if (!prefixMatch) {
      console.log("  SKIP: Can't find reason prefix at L" + reason.line);
      continue;
    }
    var prefix = prefixMatch[1];

    // For inline returns like: return { decision: "block", reason: "..." };
    // We need to preserve the closing part (}; or similar)
    var lastLine = contentLines[endIdx];
    var closingMatch = lastLine.match(/["'`]\s*(\}.*$)/);
    var closing = closingMatch ? " " + closingMatch[1] : "";
    // If no closing but the line seems to be a standalone reason: "..." without closing,
    // don't add anything
    if (!closingMatch) closing = "";

    var newReasonLine = prefix + '"' + escaped + '"' + closing;

    // Replace lines from startIdx to endIdx with the single new line
    contentLines.splice(startIdx, endIdx - startIdx + 1, newReasonLine);
    newContent = contentLines.join("\n");
    fileModified = true;
    console.log("  FIXED L" + reason.line + (endIdx > startIdx ? "-L" + (endIdx + 1) : ""));
  }

  if (fileModified && !dryRun) {
    // Verify syntax before writing
    var tmpVerify = path.join(require("os").tmpdir(), "gate-verify-" + process.pid + ".js");
    fs.writeFileSync(tmpVerify, newContent);
    try {
      cp.execSync("node -c " + JSON.stringify(tmpVerify), { encoding: "utf-8", windowsHide: true });
      fs.writeFileSync(gatePath, newContent);
      fixed++;
      console.log("  WRITTEN + VERIFIED");
    } catch (e) {
      console.log("  SYNTAX ERROR — not written. Reverting.");
      errors++;
    }
    try { fs.unlinkSync(tmpVerify); } catch (e) {}
  }
}

console.log("\n=== Summary ===");
console.log("Fixed: " + fixed);
console.log("Skipped (complex): " + skipped);
console.log("Errors: " + errors);
console.log("Remaining: " + (73 - fixed));

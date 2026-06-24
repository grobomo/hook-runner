#!/usr/bin/env node
// Behavioral analysis: reads session transcript + hook-log, calls Haiku to find patterns.
// Output: timestamped .md report
"use strict";

var fs = require("fs");
var path = require("path");
var haiku = require(path.join(process.env.HOME || "/home/ubu", ".claude", "hooks", "haiku-client"));

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var HOOK_LOG = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");
// Auto-detect project slug from cwd — Claude Code stores logs under a mangled path
var PROJECT_SLUG = process.env.CLAUDE_PROJECT_SLUG ||
  process.cwd().replace(/\\/g, "/").replace(/[/:]/g, "-").replace(/^-+/, "-");
var LOGS_DIR = path.join(HOME, ".claude", "projects", PROJECT_SLUG);

// Find today's session
var today = new Date().toISOString().slice(0, 10);
var sessions = fs.readdirSync(LOGS_DIR).filter(function(f) {
  return f.endsWith(".jsonl") && f !== "session-chain.jsonl";
}).map(function(f) {
  var fp = path.join(LOGS_DIR, f);
  return { name: f, mtime: fs.statSync(fp).mtimeMs, path: fp };
}).filter(function(s) {
  return new Date(s.mtime).toISOString().slice(0, 10) === today;
}).sort(function(a, b) { return b.mtime - a.mtime; });

if (sessions.length === 0) {
  console.log("No sessions from today found.");
  process.exit(1);
}

console.log("Found " + sessions.length + " session(s) from today.");

// Extract user messages and Opus responses (using shared parser)
var context = haiku.getConversationContext(sessions[0].path, 50);

// Extract hook-log stop events from today
var hookEntries = [];
try {
  var lines = fs.readFileSync(HOOK_LOG, "utf-8").trim().split("\n");
  for (var i = lines.length - 1; i >= 0; i--) {
    try {
      var entry = JSON.parse(lines[i]);
      if (!entry.ts || entry.ts.slice(0, 10) !== today) break;
      if (entry.event === "Stop" || entry.event === "PreToolUse") {
        hookEntries.unshift(entry);
      }
    } catch (e) {}
  }
} catch (e) {}

console.log("Hook log entries from today: " + hookEntries.length);

// Summarize hook patterns
var stopResults = {};
var mandateBlocks = 0;
var gateBlocks = {};
hookEntries.forEach(function(e) {
  if (e.event === "Stop") {
    var key = (e.module || "?") + ":" + (e.result || "?");
    stopResults[key] = (stopResults[key] || 0) + 1;
  }
  if (e.event === "PreToolUse" && e.result === "block") {
    var mod = e.module || "?";
    gateBlocks[mod] = (gateBlocks[mod] || 0) + 1;
    if (mod === "mandate-gate") mandateBlocks++;
  }
});

var hookSummary = "STOP HOOK RESULTS:\n" +
  Object.keys(stopResults).map(function(k) { return "  " + k + ": " + stopResults[k] + "x"; }).join("\n") +
  "\n\nPRETOOLUSE BLOCKS:\n" +
  Object.keys(gateBlocks).sort(function(a,b) { return gateBlocks[b] - gateBlocks[a]; }).map(function(k) { return "  " + k + ": " + gateBlocks[k] + "x"; }).join("\n") +
  "\n\nMandate blocks: " + mandateBlocks;

// Find repeated user messages (user frustration indicator)
var userMessages = [];
var ctxLines = (context || "").split("\n");
ctxLines.forEach(function(l) {
  if (l.startsWith("USER:")) userMessages.push(l.slice(5).trim().slice(0, 100));
});

var repeatedThemes = {};
userMessages.forEach(function(m) {
  var words = m.toLowerCase().split(/\s+/).filter(function(w) { return w.length > 4; });
  words.forEach(function(w) {
    repeatedThemes[w] = (repeatedThemes[w] || 0) + 1;
  });
});
var topRepeats = Object.keys(repeatedThemes)
  .filter(function(w) { return repeatedThemes[w] >= 3 && !["there","would","about","which","could","should","their"].includes(w); })
  .sort(function(a, b) { return repeatedThemes[b] - repeatedThemes[a]; })
  .slice(0, 20);

// Call Haiku for behavioral analysis
var prompt = [
  "Analyze this Claude Code session for behavioral problems. Focus on:",
  "1. Repeated user frustration (same complaint multiple times)",
  "2. Gaps where stop hooks should have fired but didn't",
  "3. Patterns of 'fix → break → fix → break' cycles",
  "4. Empty promises vs actual gate creation",
  "5. Times Claude said 'it works' without verification",
  "",
  "HOOK LOG SUMMARY:",
  hookSummary,
  "",
  "TOP REPEATED WORDS FROM USER (frustration signals):",
  topRepeats.join(", "),
  "",
  "CONVERSATION EXCERPT (last 50 turns):",
  (context || "").slice(-3000),
  "",
  "Report: list the top 5 behavioral failures with specific timestamps/evidence.",
  "Then list 3 specific gate improvements that would prevent recurrence.",
  "Be brutally honest — this analysis is for improving the system."
].join("\n");

console.log("Calling Haiku for analysis...");
var result = haiku.call({
  prompt: prompt,
  caller: "session-analyzer",
  maxTokens: 1000,
  timeoutMs: 30000
});

// Write report
var reportName = "session-analysis-" + new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + ".md";
var reportPath = path.join(process.cwd(), reportName);

var report = [
  "# Session Behavioral Analysis",
  "**Date:** " + today,
  "**Session:** " + sessions[0].name,
  "**Turns:** " + ctxLines.length,
  "**Hook events today:** " + hookEntries.length,
  "",
  "## Hook Firing Patterns",
  hookSummary,
  "",
  "## User Frustration Signals (repeated words)",
  topRepeats.map(function(w) { return "- " + w + " (" + repeatedThemes[w] + "x)"; }).join("\n"),
  "",
  "## Haiku Behavioral Analysis",
  result.ok ? result.content : "ERROR: " + result.error,
  "",
  "## Raw Stats",
  "- Sessions today: " + sessions.length,
  "- User messages: " + userMessages.length,
  "- Stop hook fires: " + Object.values(stopResults).reduce(function(a,b){return a+b;}, 0),
  "- PreToolUse blocks: " + Object.values(gateBlocks).reduce(function(a,b){return a+b;}, 0),
  "- Mandate enforcements: " + mandateBlocks,
].join("\n");

fs.writeFileSync(reportPath, report, "utf-8");
console.log("Report written: " + reportPath);

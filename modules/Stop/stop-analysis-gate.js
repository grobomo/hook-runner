#!/usr/bin/env node
"use strict";
// WORKFLOW: haiku-rules
// BLOCKING: true
// WHY: Stop hooks ran in background — their analysis and block/pass decisions
//      were invisible in the TUI, so Claude would stop even when Haiku said CONTINUE.
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ STOP ANALYSIS GATE — Haiku evaluates whether session should end         │
// │                                                                         │
// │ On every Stop event: calls Haiku with session context + rules,          │
// │ writes reasoning to stop-analysis.md, returns block/pass decision.      │
// │                                                                         │
// │ Install: symlink or copy into ~/.claude/hooks/run-modules/Stop/         │
// │ Requires: haiku-client.js in same directory (or parent hooks dir)       │
// │ Config:  STOP_RULES_PATH env or ~/.claude/proxy/stop-haiku-rules.yaml   │
// └─────────────────────────────────────────────────────────────────────────┘

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || "/home/ubu";
var haiku = require(path.join(HOME, ".claude", "hooks", "haiku-client"));
// T806: rules moved from proxy/ to hooks/rules/ — fallback to old path
var _newRulesPath = path.join(HOME, ".claude", "hooks", "rules", "stop-haiku-rules.yaml");
var RULES_PATH = process.env.STOP_RULES_PATH || (fs.existsSync(_newRulesPath) ? _newRulesPath : path.join(HOME, ".claude", "proxy", "stop-haiku-rules.yaml"));
var SESSION_PREFIX = (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8);
var ANALYSIS_PATH = path.join(HOME, ".claude", "hooks", "stop-analysis-" + SESSION_PREFIX + ".md");
var LOG_PATH = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");
var MANDATE_LOG_PATH = path.join(HOME, ".claude", "hooks", "mandate-log.jsonl");
var CORRECTIONS_PATH = path.join(HOME, ".claude", "hooks", "stop-corrections.jsonl");
var DEDUP_WINDOW_MS = 10 * 60 * 1000;
var CORRECTIONS_WINDOW_MS = 60 * 60 * 1000;

function log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "stop-analysis-gate";
  entry.event = "Stop";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8"); } catch (e) {}
}

function getSessionId() {
  return (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8);
}

function readMandateLog() {
  try {
    var content = fs.readFileSync(MANDATE_LOG_PATH, "utf-8").trim();
    if (!content) return [];
    return content.split("\n").map(function(line) {
      try { return JSON.parse(line); } catch (e) { return null; }
    }).filter(Boolean);
  } catch (e) { return []; }
}

function writeMandateEntry(entry) {
  var entries = readMandateLog();
  entries.push(entry);
  if (entries.length > 20) entries = entries.slice(-20);
  try {
    fs.writeFileSync(MANDATE_LOG_PATH, entries.map(function(e) { return JSON.stringify(e); }).join("\n") + "\n", "utf-8");
  } catch (e) {}
}

function hasRecentMandate() {
  var entries = readMandateLog();
  var now = Date.now();
  var sessionId = getSessionId();
  for (var i = entries.length - 1; i >= 0; i--) {
    var e = entries[i];
    if (!e.ts) continue;
    var age = now - new Date(e.ts).getTime();
    if (age > DEDUP_WINDOW_MS) break;
    if (e.session === sessionId) return e;
  }
  return null;
}

function getRecentCorrections() {
  try {
    var content = fs.readFileSync(CORRECTIONS_PATH, "utf-8").trim();
    if (!content) return [];
    var now = Date.now();
    var sessionId = getSessionId();
    var corrections = [];
    var lines = content.split("\n");
    for (var i = lines.length - 1; i >= 0; i--) {
      try {
        var e = JSON.parse(lines[i]);
        if (!e.ts || !e.correction) continue;
        if (now - new Date(e.ts).getTime() > CORRECTIONS_WINDOW_MS) break;
        if (e.session && e.session !== sessionId) continue;
        corrections.unshift(e.correction);
        if (corrections.length >= 5) break;
      } catch (ex) {}
    }
    return corrections;
  } catch (e) { return []; }
}

function getTranscriptPath() {
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (!projectDir) return "";
  var slug = path.resolve(projectDir).replace(/[^a-zA-Z0-9-]/g, "-");
  var logsDir = path.join(HOME, ".claude", "projects", slug);
  if (!fs.existsSync(logsDir)) return "";
  try {
    var files = fs.readdirSync(logsDir).filter(function(f) { return f.endsWith(".jsonl"); });
    if (files.length === 0) return "";
    var newest = files.reduce(function(a, b) {
      try { return fs.statSync(path.join(logsDir, a)).mtimeMs > fs.statSync(path.join(logsDir, b)).mtimeMs ? a : b; }
      catch (e) { return a; }
    });
    return path.join(logsDir, newest);
  } catch (e) { return ""; }
}

module.exports = function(input) {
  // Dedup: skip Haiku if this session already got a mandate recently
  var recentMandate = hasRecentMandate();
  if (recentMandate) {
    log({ result: "dedup_skip", recent_rule: recentMandate.rule, recent_gate: recentMandate.gate, age_s: Math.round((Date.now() - new Date(recentMandate.ts).getTime()) / 1000) });
    return null;
  }

  // Read rules
  var rules = "";
  try { rules = fs.readFileSync(RULES_PATH, "utf-8"); } catch (e) {
    log({ result: "no_rules", error: e.message });
    // No rules = can't evaluate, pass through
    return null;
  }

  // Gather context
  var transcriptPath = getTranscriptPath();
  var context = haiku.getConversationContext(transcriptPath, 8);
  var sessionId = getSessionId();

  // Get last assistant message for analysis
  var lastMsg = "";
  if (input && input.stop_hook_active === undefined) {
    // input may contain transcript_suffix or similar
    lastMsg = (input.assistant_message || "").slice(0, 500);
  }

  // Build prompt
  var corrections = getRecentCorrections();
  var correctionsBlock = corrections.length > 0
    ? "\nCORRECTIONS FROM SESSION (these override stale assumptions):\n- " + corrections.join("\n- ")
    : "";

  var prompt = [
    "You are the Stop Analysis Gate. Decide if this Claude Code session should stop or continue.",
    "",
    "RULES (evaluate each):",
    rules,
    correctionsBlock,
    "",
    context || "(no conversation context available)",
    "",
    lastMsg ? "LAST ASSISTANT MESSAGE (truncated):\n" + lastMsg : "",
    "",
    "Based on the rules and context, should the session STOP or CONTINUE?",
    "",
    "Respond with JSON:",
    '{"decision": "stop"|"continue", "reason": "one sentence why", "rule_triggered": "rule name or null", "confidence": 0.0-1.0}'
  ].join("\n");

  var result = haiku.call({
    prompt: prompt,
    caller: "stop-analysis-gate",
    jsonMode: true,
    maxTokens: 300,
    timeoutMs: 8000
  });

  // Write analysis regardless of outcome
  var analysis = [
    "# Stop Analysis",
    "**Session:** " + sessionId,
    "**Timestamp:** " + new Date().toISOString(),
    ""
  ];

  if (!result.ok) {
    analysis.push("**Result:** PASS (haiku failed: " + result.error + ")");
    analysis.push("**Latency:** " + result.ms + "ms");
    try { fs.writeFileSync(ANALYSIS_PATH, analysis.join("\n"), "utf-8"); } catch (e) {}
    log({ result: "pass_on_error", error: result.error, ms: result.ms });
    return null; // fail-open: never block on Haiku failure
  }

  var parsed = result.parsed;
  var decision = (parsed.decision || "stop").toLowerCase();
  var reason = parsed.reason || "no reason given";
  var ruleTriggered = parsed.rule_triggered || null;
  var confidence = parsed.confidence || 0.5;

  analysis.push("**Decision:** " + decision.toUpperCase());
  analysis.push("**Confidence:** " + confidence);
  analysis.push("**Reason:** " + reason);
  if (ruleTriggered) analysis.push("**Rule triggered:** " + ruleTriggered);
  analysis.push("**Latency:** " + result.ms + "ms");
  analysis.push("");
  analysis.push("## Raw Response");
  analysis.push("```");
  analysis.push(result.content.slice(0, 500));
  analysis.push("```");

  try { fs.writeFileSync(ANALYSIS_PATH, analysis.join("\n"), "utf-8"); } catch (e) {}

  log({ result: decision, reason: reason, rule: ruleTriggered, confidence: confidence, ms: result.ms });

  if (decision === "continue") {
    writeMandateEntry({ rule: ruleTriggered || "unknown", decision: "continue", gate: "stop-analysis-gate", session: sessionId, ts: new Date().toISOString() });
    return {
      decision: "block",
      reason: reason
    };
  }

  // decision === "stop" → allow session to end
  return null;
};

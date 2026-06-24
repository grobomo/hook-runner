// TOOLS: Stop
// WORKFLOW: haiku-rules
// BLOCKING: true
// WHY: Claude stops without checking if there's more to do — forgets TODOs,
//      cross-project work, and user requests that aren't finished yet.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ AUTO-CONTINUE GATE — Modular LLM-powered self-check-in                  │
// │                                                                         │
// │ On every stop:                                                          │
// │   1. Mechanistically gathers context (TODOs, user prompt, response)     │
// │   2. Loads rules from ~/.claude/proxy/stop-analysis-rules.yaml          │
// │   3. Sends context + rules to Haiku for analysis                        │
// │   4. Logs everything to hook-log.jsonl                                  │
// │                                                                         │
// │ To change behavior: edit stop-analysis-rules.yaml                       │
// │ To add a new check: add a rule entry to the yaml                        │
// │ No code changes needed.                                                 │
// │                                                                         │
// │ INCIDENT HISTORY:                                                       │
// │   2026-05-08: Claude asked "Want me to build that now?" after user      │
// │   already asked for it. Added never-ask-permission rule.                │
// │   2026-05-08: Claude declared something impossible after one try.       │
// │   Added never-give-up rule (from hook-runner's never-give-up module).   │
// │   2026-05-08: Regex-based patterns were brittle and needed constant     │
// │   maintenance. Replaced with LLM analysis + modular rule config.        │
// └─────────────────────────────────────────────────────────────────────────┘
"use strict";

var fs = require("fs");
var path = require("path");
var child_process = require("child_process");
var haiku = require(path.join(process.env.HOME || "", ".claude", "hooks", "haiku-client"));

var HOME = process.env.HOME || "/home/ubu";
// T806: rules moved from proxy/ to hooks/rules/ — fallback to old path
var RULES_PATH = path.join(HOME, ".claude", "hooks", "rules", "stop-haiku-rules.yaml");
if (!fs.existsSync(RULES_PATH)) RULES_PATH = path.join(HOME, ".claude", "proxy", "stop-haiku-rules.yaml");
var LOG_PATH = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");
var SESSION_PREFIX = (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8);
var MANDATE_PATH = path.join(HOME, ".claude", "hooks", "mandate-" + SESSION_PREFIX + ".json");
var MANDATE_LOG_PATH = path.join(HOME, ".claude", "hooks", "mandate-log.jsonl");
var CORRECTIONS_PATH = path.join(HOME, ".claude", "hooks", "stop-corrections.jsonl");
var DEDUP_WINDOW_MS = 10 * 60 * 1000;
var CORRECTIONS_WINDOW_MS = 60 * 60 * 1000;

function log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "auto-continue-gate";
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
    if (e.session === sessionId && e.type !== "rejection") return e;
  }
  return null;
}

// T837: Track rejected suggestions so Haiku doesn't re-suggest them
function getRecentRejections() {
  var entries = readMandateLog();
  var now = Date.now();
  var sessionId = getSessionId();
  var rejected = [];
  for (var i = entries.length - 1; i >= 0; i--) {
    var e = entries[i];
    if (!e.ts) continue;
    var age = now - new Date(e.ts).getTime();
    if (age > DEDUP_WINDOW_MS * 3) break; // 30-minute rejection memory
    if (e.session === sessionId && e.type === "rejection") {
      rejected.push(e.rule || e.action || "");
    }
  }
  return rejected;
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

// --- Simple YAML parser (just needs name/check/action from rules list) ---
function parseRules(yamlText) {
  var rules = [];
  var current = null;
  var lines = yamlText.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var nameMatch = line.match(/^\s+-\s+name:\s*(.+)/);
    if (nameMatch) {
      if (current) rules.push(current);
      current = { name: nameMatch[1].trim() };
      continue;
    }
    if (!current) continue;
    var checkMatch = line.match(/^\s+check:\s*"(.+)"/);
    if (checkMatch) { current.check = checkMatch[1]; continue; }
    var actionMatch = line.match(/^\s+action:\s*"(.+)"/);
    if (actionMatch) { current.action = actionMatch[1]; continue; }
  }
  if (current) rules.push(current);
  return rules;
}

// --- Context gathering ---
function findGitRoot(startDir) {
  var dir = startDir;
  for (var d = 0; d < 20; d++) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    var parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// T834: Filter dispatched/cross-project items — they belong to other sessions
var DISPATCHED_RE = /\b(dispatched|Dispatched as T\d+|assigned to|owned by|cross-project|BLOCKED:.*project not cloned)\b/i;

function readTodo(root) {
  if (!root) return null;
  try {
    var content = fs.readFileSync(path.join(root, "TODO.md"), "utf-8");
    var unchecked = content.split("\n")
      .filter(function(l) { return /- \[ \]/.test(l) && !DISPATCHED_RE.test(l); })
      .map(function(l) { return l.replace(/^[\s-]*\[ \]\s*/, "").trim(); });
    return unchecked.length > 0 ? unchecked : null;
  } catch (e) { return null; }
}

// T836: Read project role from TODO.md header (e.g. "## ROLE: manager" or "ROLE: gate-builder")
function readProjectRole(root) {
  if (!root) return null;
  try {
    var content = fs.readFileSync(path.join(root, "TODO.md"), "utf-8");
    var match = content.match(/^#+\s*ROLE:\s*(.+)/m) || content.match(/^ROLE:\s*(.+)/m);
    return match ? match[1].trim() : null;
  } catch (e) { return null; }
}

// --- Main ---
module.exports = function(input) {
  // Gather assistant response — field is "last_assistant_message" from Claude Code
  var assistantText = input.last_assistant_message || input.assistant_message || "";
  if (!assistantText && input.message) {
    assistantText = typeof input.message === "string" ? input.message : JSON.stringify(input.message);
  }
  if (!assistantText || assistantText.length < 30) {
    log({ result: "skip", reason: "response too short (" + assistantText.length + " chars)" });
    return null;
  }

  // Gather user prompt — read from transcript if not directly available
  var userPrompt = input.user_message || "";
  if (!userPrompt && input.transcript_path) {
    try {
      var lines = fs.readFileSync(input.transcript_path, "utf-8").trim().split("\n");
      for (var ti = lines.length - 1; ti >= Math.max(0, lines.length - 20); ti--) {
        try {
          var entry = JSON.parse(lines[ti]);
          if (entry.type === "human" || entry.role === "user") {
            userPrompt = (entry.content || entry.message || "").slice(0, 500);
            break;
          }
        } catch(e) {}
      }
    } catch(e) {}
  }
  if (!userPrompt) userPrompt = "(not available)";

  // Gather TODOs and project role
  var root = findGitRoot(process.cwd());
  var todos = readTodo(root);
  var projectRole = readProjectRole(root);

  // Load rules from directory (preferred) or single file (fallback)
  var rules = [];
  // T835: check both "stop" and "stop-rules" directory names
  var RULES_DIR = path.join(path.dirname(RULES_PATH), "stop");
  if (!fs.existsSync(RULES_DIR)) RULES_DIR = path.join(path.dirname(RULES_PATH), "stop-rules");
  try {
    if (fs.existsSync(RULES_DIR)) {
      var files = fs.readdirSync(RULES_DIR)
        .filter(function(f) { return /\.yaml$/.test(f) && !f.startsWith("_"); })
        .sort();
      for (var fi = 0; fi < files.length; fi++) {
        var content = fs.readFileSync(path.join(RULES_DIR, files[fi]), "utf-8");
        var rule = {};
        var nm = content.match(/^name:\s*(.+)/m);
        var ck = content.match(/^check:\s*"(.+)"/m);
        var ac = content.match(/^action:\s*"(.+)"/m);
        if (nm) rule.name = nm[1].trim();
        if (ck) rule.check = ck[1];
        if (ac) rule.action = ac[1];
        if (rule.name && rule.check) rules.push(rule);
      }
    } else {
      var yamlText = fs.readFileSync(RULES_PATH, "utf-8");
      rules = parseRules(yamlText);
    }
  } catch (e) {
    log({ result: "error", reason: "failed to load rules: " + e.message });
    return null;
  }

  if (rules.length === 0) {
    log({ result: "skip", reason: "no rules loaded" });
    return null;
  }

  // Dedup: skip Haiku if this session already got a mandate recently
  var recentMandate = hasRecentMandate();
  if (recentMandate) {
    log({ result: "dedup_skip", recent_rule: recentMandate.rule, recent_gate: recentMandate.gate, age_s: Math.round((Date.now() - new Date(recentMandate.ts).getTime()) / 1000) });
    return null;
  }

  // Check prior mandate state + T837: detect rejections
  var mandateContext = "";
  try {
    var mandate = JSON.parse(fs.readFileSync(MANDATE_PATH, "utf-8"));
    if (mandate.seen) {
      // T837: If Claude's response mentions the mandate was dispatched/irrelevant, log rejection
      var rejectionPatterns = /\b(already dispatched|is dispatched|was dispatched|not actionable|outside.*scope|belongs to another|cross-project)\b/i;
      if (rejectionPatterns.test(assistantText)) {
        writeMandateEntry({
          type: "rejection",
          rule: mandate.source_rule || "unknown",
          action: (mandate.action || "").slice(0, 100),
          reason: "Claude determined mandate was not actionable",
          session: getSessionId(),
          ts: new Date().toISOString()
        });
        log({ result: "mandate_rejected", rule: mandate.source_rule });
        try { fs.unlinkSync(MANDATE_PATH); } catch (e) {}
        // Don't re-analyze — the mandate was rejected
        return null;
      }
      mandateContext = "\nPRIOR MANDATE [" + (mandate.source_rule || "unknown") + "]: " + (mandate.action || "") +
        (mandate.actions && mandate.actions.length > 0 ? " (actions: " + mandate.actions.join(", ") + ")" : "") +
        "\nThe prior mandate was delivered to Opus. Evaluate whether it was fulfilled.";
    }
  } catch (e) {}

  // Build haiku prompt from rules
  var rulesBlock = rules.map(function(r, i) {
    return (i + 1) + ". " + r.name + ": " + r.check + "\n   → If yes: " + r.action;
  }).join("\n");

  var corrections = getRecentCorrections();
  var correctionsBlock = corrections.length > 0
    ? "\nCORRECTIONS FROM SESSION (these override stale assumptions):\n- " + corrections.join("\n- ")
    : "";

  // T837: Include recently rejected suggestions so Haiku doesn't repeat them
  var rejections = getRecentRejections();
  var rejectionsBlock = rejections.length > 0
    ? "\nREJECTED SUGGESTIONS (do NOT re-suggest these — Claude already determined they don't apply):\n- " + rejections.join("\n- ")
    : "";

  var prompt = [
    "You are a self-check-in advisor. Analyze the context against these rules and decide what should happen next.",
    "",
    "RULES (check each one):",
    rulesBlock,
    correctionsBlock,
    rejectionsBlock,
    "",
    "CONTEXT:",
    projectRole ? "Project role: " + projectRole + " (only suggest actions appropriate for this role)" : "",
    "User's last prompt: " + (userPrompt || "").slice(0, 400),
    "Assistant's last response (tail): " + assistantText.slice(-600),
    "Current TODO items: " + (todos ? todos.slice(0, 5).join("; ") : "none"),
    mandateContext,
    "",
    "Check ALL rules. If ANY rule triggers, return the appropriate action.",
    "Reply with EXACTLY this JSON (no other text):",
    '{"decision":"DONE|CONTINUE|NEXT|DISPATCH","triggered_rule":"rule-name or none","reason":"one sentence","actions":["action 1"]}',
  ].join("\n");

  // Call haiku via shared client
  var haikuResult = haiku.call({
    prompt: prompt,
    jsonMode: true,
    caller: "auto-continue-gate",
    maxTokens: 300,
    timeoutMs: 18000
  });

  try {
    if (!haikuResult.ok) {
      log({ result: "haiku_fail", error: haikuResult.error, ms: haikuResult.ms });
      return null;
    }

    var parsed = haikuResult.parsed;
    if (!parsed) {
      log({ result: "parse_fail", raw: (haikuResult.content || "").slice(0, 200) });
      return null;
    }

    var decision = (parsed.decision || "").toUpperCase();
    var triggeredRule = parsed.triggered_rule || "none";
    var reason = parsed.reason || "";
    var actions = parsed.actions || [];

    log({
      result: decision === "DONE" ? "pass" : "block",
      decision: decision,
      triggered_rule: triggeredRule,
      reason: reason,
      actions: actions,
      user_prompt: (userPrompt || "").slice(0, 150),
      tail: assistantText.slice(-100),
    });

    if (decision === "CONTINUE" || decision === "NEXT" || decision === "DISPATCH") {
      var actionList = actions.length > 0 ? "\nActions: " + actions.join(" | ") : "";
      writeMandateEntry({ rule: triggeredRule, decision: decision, gate: "auto-continue-gate", session: getSessionId(), ts: new Date().toISOString() });
      try {
        fs.writeFileSync(MANDATE_PATH, JSON.stringify({
          action: reason,
          source_rule: triggeredRule,
          decision: decision,
          actions: actions,
          created: new Date().toISOString(),
          seen: false,
          fulfilled: false
        }, null, 2), "utf-8");
      } catch (e) {}
      return {
        decision: "block",
        reason: "SELF-CHECK [\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix auto-continue-gate — {describe the issue}\"" + triggeredRule + "]: " + decision + " — " + reason + actionList,
      };
    }

    try { fs.unlinkSync(MANDATE_PATH); } catch (e) {}
    return {
      decision: "block",
      reason: "SELF-CHECK [\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix auto-continue-gate — {describe the issue}\"" + triggeredRule + "]: DONE — " + reason + "\nNo further action needed. You may stop.",
    };
  } catch (e) {
    log({ result: "error", error: e.message || String(e) });
    return null;
  }
};

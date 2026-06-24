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
// T806: rules moved from proxy/ to hooks/rules/ — fallback to old path for compatibility
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

// --- T757: L1→L2 escalation — detect anomalies in recent history ---
function detectAnomalies(history) {
  if (!history || history.length < 2) return null;

  // Anomaly 1: Same rule fired 3+ times consecutively
  var ruleCounts = {};
  for (var i = 0; i < history.length; i++) {
    var rule = history[i].rule || "none";
    ruleCounts[rule] = (ruleCounts[rule] || 0) + 1;
  }
  var ruleNames = Object.keys(ruleCounts);
  for (var r = 0; r < ruleNames.length; r++) {
    if (ruleNames[r] !== "none" && ruleCounts[ruleNames[r]] >= 3) {
      return { type: "stuck-loop", rule: ruleNames[r], count: ruleCounts[ruleNames[r]], detail: "Same rule '" + ruleNames[r] + "' triggered " + ruleCounts[ruleNames[r]] + "x in last " + history.length + " calls" };
    }
  }

  // Anomaly 2: Flip-flop (DONE→CONTINUE→DONE or CONTINUE→DONE→CONTINUE)
  if (history.length >= 3) {
    var d0 = history[0].decision, d1 = history[1].decision, d2 = history[2].decision;
    if (d0 && d1 && d2 && d0 === d2 && d0 !== d1) {
      return { type: "flip-flop", detail: "Decision oscillating: " + d2 + "→" + d1 + "→" + d0 };
    }
  }

  // Anomaly 3: Module errors in recent hook-log (crashes, timeouts)
  try {
    var logContent = fs.readFileSync(LOG_PATH, "utf-8").trim();
    var logLines = logContent.split("\n");
    var recentErrors = 0;
    var errorModules = [];
    var fiveMinAgo = Date.now() - 5 * 60 * 1000;
    for (var ei = logLines.length - 1; ei >= Math.max(0, logLines.length - 100); ei--) {
      try {
        var entry = JSON.parse(logLines[ei]);
        if (new Date(entry.ts).getTime() < fiveMinAgo) break;
        if (entry.result === "error" && entry.module) {
          recentErrors++;
          if (errorModules.indexOf(entry.module) === -1) errorModules.push(entry.module);
        }
      } catch (ex) {}
    }
    if (recentErrors >= 3) {
      return { type: "module-crashes", detail: recentErrors + " errors in last 5min from: " + errorModules.join(", ") };
    }
  } catch (e) {}

  // Anomaly 4: User prompt consistently unavailable
  var promptMissing = 0;
  for (var pi = 0; pi < history.length; pi++) {
    if (history[pi].reason && /unavailable|not found|no assistant text/i.test(history[pi].reason)) {
      promptMissing++;
    }
  }
  if (promptMissing >= 2) {
    return { type: "prompt-unavailable", detail: promptMissing + "/" + history.length + " recent stops had unavailable prompts" };
  }

  return null;
}

// T757: Write L2 findings to self-healing store
function writeL2ToSelfHealing(anomaly, l2Result) {
  var selfHealDir = path.join(HOME, ".claude", "hooks", "self-healing", "lessons", "gate");
  try { fs.mkdirSync(selfHealDir, { recursive: true }); } catch (e) {}
  var entry = {
    ts: new Date().toISOString(),
    anomaly_type: anomaly.type,
    root_cause: l2Result.root_cause || "unknown",
    severity: l2Result.severity || "medium",
    fix_type: l2Result.fix_type || "unknown",
    recommendation: l2Result.recommendation || "none",
    session: getSessionId()
  };
  try {
    fs.appendFileSync(path.join(selfHealDir, "l2-escalations.jsonl"), JSON.stringify(entry) + "\n");
  } catch (e) {}
}

function escalateToL2(anomaly, context) {
  var prompt = [
    "You are an L2 diagnostic analyzer for a Claude Code hook system.",
    "An L1 gate (Haiku) detected an anomaly pattern that needs deeper analysis.",
    "",
    "ANOMALY: " + anomaly.type + " — " + anomaly.detail,
    "",
    "CONTEXT:",
    "Project: " + (process.env.CLAUDE_PROJECT_DIR || process.cwd()),
    "User prompt: " + (context.userPrompt || "(unavailable)").slice(0, 300),
    "Assistant response (tail): " + (context.assistantText || "").slice(-400),
    "TODO items: " + (context.todos || "none"),
    "",
    "ANALYZE:",
    "1. What is the root cause of this anomaly?",
    "2. Is Opus stuck in a loop, or is the L1 rule misconfigured?",
    "3. What specific action would resolve this?",
    "",
    "Reply with JSON:",
    '{"root_cause":"one sentence","fixable":true/false,"fix_type":"rule-adjustment|context-reset|task-complete|stuck-loop","recommendation":"specific action","severity":"low|medium|high"}'
  ].join("\n");

  var result = haiku.call({
    prompt: prompt,
    caller: "auto-continue-L2-escalation",
    jsonMode: true,
    maxTokens: 500,
    timeoutMs: 12000,
    model: "sonnet"
  });

  if (result.ok && result.parsed) {
    log({ result: "l2_escalation", anomaly: anomaly.type, l2_ms: result.ms, l2_diagnosis: result.parsed });
    return result.parsed;
  }
  log({ result: "l2_escalation_fail", anomaly: anomaly.type, error: result.error, ms: result.ms });
  return null;
}

// --- T756: Read own recent decisions from hook-log.jsonl ---
function getRecentSelfHistory(count) {
  count = count || 5;
  var results = [];
  try {
    var content = fs.readFileSync(LOG_PATH, "utf-8").trim();
    var lines = content.split("\n");
    var now = Date.now();
    // Scan backwards for auto-continue-gate entries
    for (var i = lines.length - 1; i >= Math.max(0, lines.length - 100) && results.length < count; i--) {
      try {
        var entry = JSON.parse(lines[i]);
        if (entry.module !== "auto-continue-gate") continue;
        if (entry.event !== "Stop") continue;
        // Skip non-decision entries (transcript_fallback, skip, error, dedup_skip)
        if (!entry.decision && entry.result !== "pass" && entry.result !== "block") continue;
        var ageMs = now - new Date(entry.ts).getTime();
        if (ageMs > 60 * 60 * 1000) break; // only look at last hour
        var agoMin = Math.round(ageMs / 60000);
        var agoStr = agoMin < 1 ? "<1min" : agoMin + "min";
        results.push({
          decision: entry.decision || entry.result || "unknown",
          rule: entry.triggered_rule || entry.reason_rule || "none",
          reason: (entry.reason || "").slice(0, 80),
          ago: agoStr
        });
      } catch (e) {}
    }
  } catch (e) {}
  return results;
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

function readTodo(root) {
  if (!root) return null;
  try {
    var content = fs.readFileSync(path.join(root, "TODO.md"), "utf-8");
    var unchecked = content.split("\n")
      .filter(function(l) { return /- \[ \]/.test(l); })
      .map(function(l) { return l.replace(/^[\s-]*\[ \]\s*/, "").trim(); });
    return unchecked.length > 0 ? unchecked : null;
  } catch (e) { return null; }
}

// --- Transcript reader (T740, T753 fallback) ---
function findTranscriptPath() {
  var sessionId = process.env.CLAUDE_SESSION_ID || "";
  var projectsDir = path.join(HOME, ".claude", "projects");

  // Strategy 1: exact session ID match
  if (sessionId) {
    try {
      var dirs = fs.readdirSync(projectsDir);
      for (var d = 0; d < dirs.length; d++) {
        var candidate = path.join(projectsDir, dirs[d], sessionId + ".jsonl");
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch (e) {}
  }

  // Strategy 2 (T753): find most recently modified .jsonl in the project dir matching cwd
  // This catches cases where session ID doesn't match transcript filenames
  try {
    var cwd = process.cwd().replace(/\\/g, "/").toLowerCase();
    var dirs2 = fs.readdirSync(projectsDir);
    var bestPath = null, bestMtime = 0;
    for (var d2 = 0; d2 < dirs2.length; d2++) {
      // Match project dir name to cwd
      var dirName = dirs2[d2].replace(/--/g, "/").replace(/-/g, "/").toLowerCase();
      if (cwd.indexOf(dirName.slice(0, 20)) < 0 && dirName.indexOf(cwd.slice(0, 20).replace(/\//g, "/")) < 0) continue;
      var projDir = path.join(projectsDir, dirs2[d2]);
      try {
        var files = fs.readdirSync(projDir);
        for (var f = 0; f < files.length; f++) {
          if (!files[f].endsWith(".jsonl")) continue;
          var fp = path.join(projDir, files[f]);
          var stat = fs.statSync(fp);
          if (stat.mtimeMs > bestMtime) {
            bestMtime = stat.mtimeMs;
            bestPath = fp;
          }
        }
      } catch (ex) {}
    }
    // Only use if modified within the last 5 minutes (active session)
    if (bestPath && (Date.now() - bestMtime) < 5 * 60 * 1000) {
      return bestPath;
    }
  } catch (e) {}

  return null;
}

function readLastFromTranscript(transcriptPath, role) {
  if (!transcriptPath) return "";
  try {
    var content = fs.readFileSync(transcriptPath, "utf-8").trim();
    var lines = content.split("\n");
    // T755: Expanded from 30 to 120 lines — user text can be 60+ lines back
    // due to tool_result entries between user text and end of transcript
    for (var i = lines.length - 1; i >= Math.max(0, lines.length - 120); i--) {
      try {
        var entry = JSON.parse(lines[i]);
        var type = entry.type || entry.role || "";
        if (role === "assistant" && (type === "assistant")) {
          var msg = entry.message || {};
          var c = msg.content;
          if (typeof c === "string") return c.slice(0, 2000);
          if (Array.isArray(c)) {
            var parts = [];
            for (var j = 0; j < c.length; j++) {
              if (c[j] && c[j].type === "text" && c[j].text) parts.push(c[j].text);
            }
            if (parts.length > 0) return parts.join(" ").slice(0, 2000);
          }
        }
        if (role === "user" && (type === "user" || type === "human")) {
          var msg2 = entry.message || {};
          var c2 = msg2.content;
          if (typeof c2 === "string" && c2.trim()) return c2.slice(0, 500);
          if (Array.isArray(c2)) {
            // T755: Skip entries that only contain tool_result items (no actual user text)
            var parts2 = [];
            for (var k = 0; k < c2.length; k++) {
              if (c2[k] && c2[k].type === "text" && c2[k].text && c2[k].text.trim()) parts2.push(c2[k].text);
            }
            if (parts2.length > 0) return parts2.join(" ").slice(0, 500);
            // If no text parts found, continue searching (this entry is just tool_results)
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
  return "";
}

// --- Main ---
module.exports = function(input) {
  // Gather assistant response — field is "last_assistant_message" from Claude Code
  var assistantText = input.last_assistant_message || input.assistant_message || "";
  if (!assistantText && input.message) {
    assistantText = typeof input.message === "string" ? input.message : JSON.stringify(input.message);
  }
  // T740: Fall back to reading transcript when assistant_response not in input
  // T784: Only trigger infra-safety-net when text is truly absent, not just short
  var transcriptPath = input.transcript_path || findTranscriptPath();
  var inputHadMessage = !!(input.last_assistant_message || input.assistant_message || input.message);
  if (!assistantText) {
    // No text at all — try transcript fallback
    if (transcriptPath) {
      assistantText = readLastFromTranscript(transcriptPath, "assistant");
      log({ result: "transcript_fallback", reason: "read from transcript (" + assistantText.length + " chars)" });
    }
    if (!assistantText) {
      log({ result: "skip", reason: "no assistant text from input or transcript" });
      return { decision: "block", reason: "SELF-CHECK [infra-safety-net]: CONTINUE — Stop hook could not read assistant response. Keys in input: " + Object.keys(input).join(", ") + ". Transcript: " + (transcriptPath || "not found") + ". This likely means Claude Code did not pass last_assistant_message. Check .last-stop-input.json for debugging." };
    }
  } else if (assistantText.length < 30 && !inputHadMessage) {
    // Short text from indirect source — try transcript for a longer version
    if (transcriptPath) {
      var longer = readLastFromTranscript(transcriptPath, "assistant");
      if (longer && longer.length > assistantText.length) {
        assistantText = longer;
        log({ result: "transcript_fallback", reason: "upgraded short text (" + assistantText.length + " chars)" });
      }
    }
  }
  // T784: Short but present messages proceed to Haiku analysis normally

  // Gather user prompt — read from transcript if not directly available
  var userPrompt = input.user_message || "";
  if (!userPrompt && transcriptPath) {
    userPrompt = readLastFromTranscript(transcriptPath, "user");
  }
  if (!userPrompt) userPrompt = "(not available)";

  // Gather TODOs — try git root first, fall back to cwd and CLAUDE_PROJECT_DIR
  var root = findGitRoot(process.cwd());
  var todos = readTodo(root);
  if (!todos) todos = readTodo(process.cwd());
  if (!todos && process.env.CLAUDE_PROJECT_DIR) todos = readTodo(process.env.CLAUDE_PROJECT_DIR);

  // Load rules from directory (preferred) or single file (fallback)
  var rules = [];
  var RULES_DIR = path.join(path.dirname(RULES_PATH), "stop-rules");
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

  // Check prior mandate state
  var mandateContext = "";
  try {
    var mandate = JSON.parse(fs.readFileSync(MANDATE_PATH, "utf-8"));
    if (mandate.seen) {
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

  // T756: Read own recent decisions from hook-log for context
  var recentHistory = getRecentSelfHistory(5);
  var historyBlock = recentHistory.length > 0
    ? "\nRECENT STOP DECISIONS (last " + recentHistory.length + " calls — look for patterns):\n" +
      recentHistory.map(function(h) { return "  " + h.ago + " ago: " + h.decision + " [" + h.rule + "] — " + h.reason; }).join("\n")
    : "";

  var prompt = [
    "You are a self-check-in advisor. Analyze the context against these rules and decide what should happen next.",
    "",
    "RULES (check each one):",
    rulesBlock,
    correctionsBlock,
    historyBlock,
    "",
    "CONTEXT:",
    "User's last prompt: " + (userPrompt || "").slice(0, 400),
    "Assistant's last response (tail): " + assistantText.slice(-600),
    "Current TODO items: " + (todos ? todos.slice(0, 5).join("; ") : "none"),
    mandateContext,
    "",
    "Check ALL rules. If ANY rule triggers, return the appropriate action.",
    "If you see 3+ CONTINUE decisions in recent history for the same rule, consider whether Opus is stuck in a loop — suggest a different approach or DONE.",
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

    // T757: Check for anomalies in recent history → escalate to L2 if found
    var l2Alert = "";
    var anomaly = detectAnomalies(recentHistory);
    if (anomaly) {
      var l2Result = escalateToL2(anomaly, {
        userPrompt: userPrompt,
        assistantText: assistantText,
        todos: todos ? todos.slice(0, 5).join("; ") : "none"
      });
      if (l2Result) {
        l2Alert = "\n\nL2 ANALYSIS [" + anomaly.type + "]: " + (l2Result.root_cause || "unknown") +
          "\nSeverity: " + (l2Result.severity || "unknown") +
          "\nRecommendation: " + (l2Result.recommendation || "none") +
          (l2Result.fix_type ? "\nFix type: " + l2Result.fix_type : "");
        // T757: Persist L2 findings to self-healing store
        writeL2ToSelfHealing(anomaly, l2Result);
      }
    }

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
        reason: "SELF-CHECK [" + triggeredRule + "]: " + decision + " — " + reason + actionList + l2Alert,
      };
    }

    try { fs.unlinkSync(MANDATE_PATH); } catch (e) {}
    return {
      decision: "block",
      reason: "SELF-CHECK [" + triggeredRule + "]: DONE — " + reason + "\nNo further action needed. You may stop." + l2Alert,
    };
  } catch (e) {
    log({ result: "error", error: e.message || String(e) });
    return null;
  }
};

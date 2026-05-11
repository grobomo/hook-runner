#!/usr/bin/env node
"use strict";
// hook-runner UserPromptSubmit — prompt logging and frustration detection.
//
// WHY modules are banned here: Any module that returns {decision:"block"} on
// UserPromptSubmit locks the user out of their session entirely — they cannot
// send any message to Claude to fix it. The frustration-detector incident
// (2026-04-07) proved this. hook-editing-gate enforces the ban.
//
// This runner does THREE things directly (no modules):
// 1. Logs the prompt preview to hook-log.jsonl (replaces prompt-logger module)
// 2. Detects frustration patterns and writes to frustration-log.jsonl
//    (replaces frustration-detector module — but NEVER blocks)
// 3. L1 Haiku triage — resolves shorthand, enriches context, prints to stdout
//    (output appears as <user-prompt-submit-hook> in conversation)
//
// Self-reflection (Stop hook) reads both logs for analysis.
var fs = require("fs");
var path = require("path");
var os = require("os");
var hookLog = require("./hook-log");

var HOOKS_DIR = path.join(os.homedir(), ".claude", "hooks");
var FRUSTRATION_LOG = path.join(HOOKS_DIR, "frustration-log.jsonl");

var input;
try {
  var raw = process.env.HOOK_INPUT_FILE
    ? fs.readFileSync(process.env.HOOK_INPUT_FILE, "utf-8")
    : fs.readFileSync(0, "utf-8");
  input = JSON.parse(raw);
} catch (e) {
  process.exit(0);
}

// Extract user message
var prompt = "";
if (input && input.message && typeof input.message === "string") {
  prompt = input.message;
} else if (input && input.prompt && typeof input.prompt === "string") {
  prompt = input.prompt;
}

// 1. Log prompt preview to hook-log (replaces prompt-logger module)
var ctx = hookLog.extractContext("UserPromptSubmit", input);
ctx.reason = prompt.substring(0, 200);
hookLog.logHook("UserPromptSubmit", "runner", "pass", ctx);

// 2. Frustration detection — pattern match only, NEVER block
if (prompt.length >= 5) {
  var PATTERNS = [
    { re: /\bi will not repeat\b/i, cat: "repeated-instruction" },
    { re: /\bi already (said|told|stated|explained|mentioned)\b/i, cat: "repeated-instruction" },
    { re: /\bas i (said|stated|told|already)\b/i, cat: "repeated-instruction" },
    { re: /\bhow many times\b/i, cat: "repeated-instruction" },
    { re: /\bfor the (last|third|fourth|fifth) time\b/i, cat: "repeated-instruction" },
    { re: /\bread (my|the) (message|prompt|instruction)\b/i, cat: "repeated-instruction" },
    { re: /\bmake it work\b/i, cat: "constraint-rejected" },
    { re: /\bstop (arguing|pushing back|telling me)\b/i, cat: "constraint-rejected" },
    { re: /\bdon'?t tell me (it'?s |it is )?(not possible|impossible|can'?t)\b/i, cat: "constraint-rejected" },
    { re: /\bfigure it out\b/i, cat: "constraint-rejected" },
    { re: /\bresearch (online|the web|internet)\b/i, cat: "wrong-tool" },
    { re: /\buse (web ?search|the internet|google)\b/i, cat: "wrong-tool" },
    { re: /\bdon'?t (grep|search local)\b/i, cat: "wrong-tool" },
    { re: /\bthat'?s not what i (asked|said|meant|wanted)\b/i, cat: "meta-frustration" },
    { re: /\byou'?re not listening\b/i, cat: "meta-frustration" }
  ];

  var matched = null;
  for (var i = 0; i < PATTERNS.length; i++) {
    if (PATTERNS[i].re.test(prompt)) {
      matched = PATTERNS[i];
      break;
    }
  }

  if (matched) {
    try {
      var entry = {
        ts: new Date().toISOString(),
        project: ctx.project || "unknown",
        category: matched.cat,
        preview: prompt.substring(0, 200)
      };
      fs.appendFileSync(FRUSTRATION_LOG, JSON.stringify(entry) + "\n");
    } catch (e) { /* best effort */ }
  }
}

// 3. L1 Haiku triage — resolve shorthand, enrich context for Opus
if (prompt.length >= 3 && prompt.charAt(0) !== "+") {
  try {
    var haiku = require("./haiku-client");
    var rulesPath = path.join(os.homedir(), ".claude", "proxy", "userprompt-haiku-rules.yaml");
    var rules = "";
    try { rules = fs.readFileSync(rulesPath, "utf-8"); } catch (e) {}

    if (rules) {
      var sessionPrefix = (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8);
      var analysisFile = path.join(HOOKS_DIR, "l1-analysis-" + sessionPrefix + ".md");
      var symlinkPath = path.join(HOOKS_DIR, "l1-analysis.md");

      var result = haiku.call({
        system: rules,
        prompt: 'Analyze this user prompt. Resolve shorthand, detect ambiguity, infer action.\n\nPROMPT: "' +
          prompt.slice(0, 500).replace(/"/g, '\\"') + '"\n\n' +
          'Reply with JSON: {"interpretation":"what they mean","confidence":"high|medium|low","notes":"context if useful"}',
        caller: "l1-triage",
        maxTokens: 150,
        timeoutMs: 4000,
        jsonMode: true
      });

      if (result.ok && result.parsed) {
        var interp = result.parsed.interpretation || result.content || "";
        var conf = result.parsed.confidence || "high";
        var notes = result.parsed.notes || "";
        var analysis = "# L1 Analysis\n" +
          "**Interpretation**: " + interp + "\n" +
          "**Confidence**: " + conf + "\n" +
          (notes ? "**Notes**: " + notes + "\n" : "");

        fs.writeFileSync(analysisFile, analysis, "utf-8");
        try { fs.unlinkSync(symlinkPath); } catch (e) {}
        try { fs.symlinkSync(analysisFile, symlinkPath); } catch (e) {}

        process.stdout.write("L1: " + interp.slice(0, 200) +
          (conf !== "high" ? " [" + conf + " confidence]" : "") + "\n");
      }
    }
  } catch (e) { /* fail silently — never block */ }
}

process.exit(0);

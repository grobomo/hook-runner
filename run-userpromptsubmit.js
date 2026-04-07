#!/usr/bin/env node
"use strict";
// hook-runner UserPromptSubmit — prompt logging and frustration detection.
//
// WHY modules are banned here: Any module that returns {decision:"block"} on
// UserPromptSubmit locks the user out of their session entirely — they cannot
// send any message to Claude to fix it. The frustration-detector incident
// (2026-04-07) proved this. hook-editing-gate enforces the ban.
//
// This runner does TWO things directly (no modules):
// 1. Logs the prompt preview to hook-log.jsonl (replaces prompt-logger module)
// 2. Detects frustration patterns and writes to frustration-log.jsonl
//    (replaces frustration-detector module — but NEVER blocks)
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
  input = JSON.parse(fs.readFileSync(0, "utf-8"));
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

// NEVER output anything — no blocking, no modifying the prompt
process.exit(0);

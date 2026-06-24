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

// 1b. Write turn marker for stop-fired detection (T726, T755: session-scoped)
var sessionId = (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8);
var TURN_MARKER = path.join(HOOKS_DIR, ".last-turn-start-" + sessionId);
var prevTurn = 0;
try {
  var prev = JSON.parse(fs.readFileSync(TURN_MARKER, "utf-8"));
  if (prev.session === sessionId) prevTurn = prev.turn || 0;
} catch (e) {}
try {
  fs.writeFileSync(TURN_MARKER, JSON.stringify({ session: sessionId, turn: prevTurn + 1, ts: new Date().toISOString() }));
} catch (e) {}

// 2. Frustration detection — pattern match only, NEVER block
if (prompt.length >= 2) {
  var PATTERNS = [
    // Repeated instruction — user said this before
    { re: /\bi will not repeat\b/i, cat: "repeated-instruction" },
    { re: /\bi already (said|told|stated|explained|mentioned)\b/i, cat: "repeated-instruction" },
    { re: /\bas i (said|stated|told|already)\b/i, cat: "repeated-instruction" },
    { re: /\bhow many times\b/i, cat: "repeated-instruction" },
    { re: /\bfor the (last|third|fourth|fifth) time\b/i, cat: "repeated-instruction" },
    { re: /\bread (my|the) (message|prompt|instruction)\b/i, cat: "repeated-instruction" },
    // Constraint rejected — user pushes back on Claude's refusal
    { re: /\bmake it work\b/i, cat: "constraint-rejected" },
    { re: /\bstop (arguing|pushing back|telling me)\b/i, cat: "constraint-rejected" },
    { re: /\bdon'?t tell me (it'?s |it is )?(not possible|impossible|can'?t)\b/i, cat: "constraint-rejected" },
    { re: /\bfigure it out\b/i, cat: "constraint-rejected" },
    // Wrong tool — user corrects Claude's tool choice
    { re: /\bresearch (online|the web|internet)\b/i, cat: "wrong-tool" },
    { re: /\buse (web ?search|the internet|google)\b/i, cat: "wrong-tool" },
    { re: /\bdon'?t (grep|search local)\b/i, cat: "wrong-tool" },
    // Meta frustration — user says Claude isn't understanding
    { re: /\bthat'?s not what i (asked|said|meant|wanted)\b/i, cat: "meta-frustration" },
    { re: /\byou'?re not listening\b/i, cat: "meta-frustration" },
    { re: /\btell me why\b/i, cat: "meta-frustration" },
    // Profanity — strong language indicates frustration
    { re: /\bf+u+c+k+/i, cat: "profanity" },
    { re: /\bshit\b/i, cat: "profanity" },
    { re: /\bdamn(it|ed)?\b/i, cat: "profanity" },
    { re: /\bmother\s*fuck/i, cat: "profanity" },
    { re: /\bwhat the hell\b/i, cat: "profanity" },
    // Direct contradiction — short angry corrections
    { re: /\bwrong\s*[!.]*$/i, cat: "direct-contradiction" },
    { re: /^no[!.\s]*$/i, cat: "direct-contradiction" },
    { re: /^stop[!.\s]*$/i, cat: "direct-contradiction" },
    // Negative quality judgment — user calls output bad
    { re: /\b(terrible|awful|garbage|useless|stupid|dumb|horrible|pathetic|idiotic)\b/i, cat: "quality-complaint" },
    { re: /\bwhat a (mess|waste|joke)\b/i, cat: "quality-complaint" },
    { re: /\bmeaningless\s+(jargon|name|word)\b/i, cat: "quality-complaint" },
    // Punctuation spam — excessive ! or ?
    { re: /[!?]{3,}/, cat: "punctuation-spam" }
  ];

  // ALL CAPS detection — >50% uppercase letters in prompt (min 4 letters)
  var letters = prompt.replace(/[^a-zA-Z]/g, "");
  var upper = prompt.replace(/[^A-Z]/g, "");
  var capsRatio = letters.length >= 4 ? upper.length / letters.length : 0;

  var matched = null;
  for (var i = 0; i < PATTERNS.length; i++) {
    if (PATTERNS[i].re.test(prompt)) {
      matched = PATTERNS[i];
      break;
    }
  }
  // Caps check — fires independently if no pattern matched
  if (!matched && capsRatio > 0.5) {
    matched = { cat: "all-caps" };
  }

  if (matched) {
    try {
      var entry = {
        ts: new Date().toISOString(),
        project: ctx.project || "unknown",
        category: matched.cat,
        preview: prompt.substring(0, 200)
      };
      if (matched.cat === "all-caps") entry.capsRatio = Math.round(capsRatio * 100);
      fs.appendFileSync(FRUSTRATION_LOG, JSON.stringify(entry) + "\n");
    } catch (e) { /* best effort */ }
  }
}

// 3. L1 Haiku triage — resolve shorthand, gather context, enrich for Opus
// T743: L1 is a research assistant, not a copyeditor. It gathers context
// mechanically (file reads) then sends prompt + context to Haiku for interpretation.
if (prompt.length >= 3 && prompt.charAt(0) !== "+") {
  try {
    var haiku = require("./haiku-client");
    // T806: rules moved from proxy/ to hooks/rules/ — fallback to old path
    var rulesPath = path.join(os.homedir(), ".claude", "hooks", "rules", "userprompt-haiku-rules.yaml");
    if (!fs.existsSync(rulesPath)) rulesPath = path.join(os.homedir(), ".claude", "proxy", "userprompt-haiku-rules.yaml");
    var rules = "";
    try { rules = fs.readFileSync(rulesPath, "utf-8"); } catch (e) {}

    if (rules) {
      var sessionPrefix = (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8);
      var analysisFile = path.join(HOOKS_DIR, "l1-analysis-" + sessionPrefix + ".md");
      var symlinkPath = path.join(HOOKS_DIR, "l1-analysis.md");
      var projDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

      // T743: Gather context mechanically before calling Haiku
      var gathered = [];

      // a) TODO.md — unchecked items summary
      try {
        var todoPath = path.join(projDir, "TODO.md");
        if (fs.existsSync(todoPath)) {
          var todoContent = fs.readFileSync(todoPath, "utf-8");
          var uncheckedLines = (todoContent.match(/^- \[ \] T\d+.*/gm) || []);
          var actionable = uncheckedLines.filter(function(l) {
            return !/BLOCKED|DEFERRED|DESIGN NEEDED/i.test(l);
          });
          if (actionable.length > 0) {
            gathered.push("TODO: " + actionable.length + " actionable items. Top 3: " +
              actionable.slice(0, 3).map(function(l) {
                return l.replace(/^- \[ \] /, "").substring(0, 80);
              }).join(" | "));
          }
        }
      } catch (e) {}

      // b) Coconut status request
      try {
        var coconutReq = path.join(projDir, ".coconut", "STATUS_REQUEST.md");
        if (fs.existsSync(coconutReq)) {
          var reqContent = fs.readFileSync(coconutReq, "utf-8").trim();
          var lines = reqContent.split("\n").filter(function(l) {
            return l.trim() && !l.startsWith("#");
          });
          if (lines.length > 0) {
            gathered.push("COCONUT: Status request pending — " + lines[0].substring(0, 100));
          }
        }
      } catch (e) {}

      // c) Recent correction (last 15 min)
      try {
        var corrLog = path.join(HOOKS_DIR, "correction-log.jsonl");
        if (fs.existsSync(corrLog)) {
          var corrContent = fs.readFileSync(corrLog, "utf-8").trim();
          if (corrContent) {
            var corrLines = corrContent.split("\n").slice(-3);
            var cutoff = Date.now() - 15 * 60 * 1000;
            for (var ci = corrLines.length - 1; ci >= 0; ci--) {
              try {
                var ce = JSON.parse(corrLines[ci]);
                if (ce.ts && new Date(ce.ts).getTime() > cutoff) {
                  gathered.push("CORRECTION: Recent user correction — " +
                    (ce.prompt_preview || "").substring(0, 80));
                  break;
                }
              } catch (e) {}
            }
          }
        }
      } catch (e) {}

      // d) Self-healing pending flag
      try {
        var reflFlag = path.join(HOOKS_DIR, ".reflection-pending.json");
        if (fs.existsSync(reflFlag)) {
          var rf = JSON.parse(fs.readFileSync(reflFlag, "utf-8"));
          if (rf && !rf.reflected) {
            gathered.push("REFLECTION: Pending — correction not yet reflected in TODO.md");
          }
        }
      } catch (e) {}

      // Build context block for Haiku
      var contextBlock = gathered.length > 0
        ? "\n\nPROJECT CONTEXT (gathered by L1):\n" + gathered.join("\n")
        : "";

      var result = haiku.call({
        system: rules,
        prompt: 'Analyze this user prompt. Resolve shorthand, detect ambiguity, infer action.' +
          contextBlock +
          '\n\nPROMPT: "' + prompt.slice(0, 500).replace(/"/g, '\\"') + '"\n\n' +
          'Reply with JSON: {"interpretation":"what they mean","confidence":"high|medium|low","notes":"context if useful","action":"what Opus should do first","requests":["list of actionable work requests, empty if none (e.g. questions, acknowledgments, continue)"]}',
        caller: "l1-triage",
        maxTokens: 300,
        timeoutMs: 8000,
        jsonMode: true
      });

      var parsed = result.parsed;
      if (!parsed && result.content) {
        var m = result.content.match(/"interpretation"\s*:\s*"([^"]+)"/);
        if (m) parsed = { interpretation: m[1], confidence: "high" };
      }
      if (parsed) {
        var interp = parsed.interpretation || result.content || "";
        var conf = parsed.confidence || "high";
        var notes = parsed.notes || "";
        var action = parsed.action || "";
        var analysis = "# L1 Analysis\n" +
          "**Interpretation**: " + interp + "\n" +
          "**Confidence**: " + conf + "\n" +
          (action ? "**Action**: " + action + "\n" : "") +
          (notes ? "**Notes**: " + notes + "\n" : "") +
          (gathered.length > 0 ? "\n## Pre-gathered Context\n" +
            gathered.map(function(g) { return "- " + g; }).join("\n") + "\n" : "");

        fs.writeFileSync(analysisFile, analysis, "utf-8");
        try { fs.unlinkSync(symlinkPath); } catch (e) {}
        try { fs.symlinkSync(analysisFile, symlinkPath); } catch (e) {}

        process.stdout.write("L1: " + interp.slice(0, 200) +
          (conf !== "high" ? " [" + conf + " confidence]" : "") + "\n");

        // T802: Write pending requests for todo-first-gate enforcement
        var requests = parsed.requests;
        var pendingFile = path.join(HOOKS_DIR, ".pending-requests-" + sessionPrefix + ".json");
        if (Array.isArray(requests) && requests.length > 0) {
          try {
            fs.writeFileSync(pendingFile, JSON.stringify({
              requests: requests,
              ts: new Date().toISOString(),
              prompt_preview: prompt.substring(0, 200)
            }));
          } catch (e) { /* best effort */ }
        } else {
          // No actionable requests — clear any existing lock
          try { fs.unlinkSync(pendingFile); } catch (e) { /* OK if not exists */ }
        }
      }
    }
  } catch (e) { /* fail silently — never block */ }
}

process.exit(0);

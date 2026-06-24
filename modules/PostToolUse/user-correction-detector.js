// TOOLS: *
// WORKFLOW: shtd, starter, gsd, haiku-rules
// WHY: Claude often ignores user corrections — the user says "no, wrong" or "I already
// told you X" and Claude plows ahead with the same approach. The self-reflection system
// catches this at session end, but by then the damage is done. This module detects
// corrections in real-time (after each tool use) so Claude gets immediate feedback.
// T603: Real-time user correction detector.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var HOOKS_DIR = path.join(os.homedir(), ".claude", "hooks");
var PROMPT_LOG = path.join(HOOKS_DIR, "prompt-log.jsonl");
var CORRECTION_LOG = path.join(HOOKS_DIR, "correction-log.jsonl");
// Tracks which prompt timestamps have already fired — one entry per prompt, not global cooldown
var FIRED_LOG = path.join(os.tmpdir(), ".correction-detector-fired.json");

// Strong correction patterns — high confidence, standalone triggers
var STRONG_PATTERNS = [
  /^no[,.\s!]+(?:that|you|i(?:'[a-z]+)?|it|this|the|we|don't|do not|wrong|stop)/i,
  /^(?:wrong|incorrect|that's wrong|that's not right|that's not what)/i,
  /\b(?:i already (?:told|said|asked|explained|mentioned))\b/i,
  /\b(?:i said|as i (?:said|mentioned|asked|told))\b/i,
  /\b(?:not what i (?:asked|wanted|meant|said|requested))\b/i,
  /\b(?:you (?:should have|were supposed to|forgot to|missed|skipped|ignored))\b/i,
  /\b(?:that's (?:not right|incorrect|not correct|the opposite))\b/i,
  /\b(?:try again|do it (?:again|over)|redo|start over)\b/i,
  /\bstop[,.\s]+(?:doing|making|using|trying|ignoring|repeating)\b/i,
  /\b(?:how many times|i(?:'ve)? (?:told|said|asked) you)\b/i,
  /\b(?:read (?:my|the) (?:message|prompt|instruction|request) again)\b/i,
  /\b(?:pay attention|listen to me|read what i)\b/i
];

// Moderate patterns — need the prompt to be short (< 150 chars) to trigger
var MODERATE_PATTERNS = [
  /^(?:no|nope|wrong)[.!]*$/i,
  /^(?:stop|cancel|undo|revert)[.!]*$/i,
  /\b(?:i (?:didn't|did not) (?:ask|want|say|mean))\b/i,
  /\b(?:that's not it|not even close|completely wrong)\b/i,
  /\b(?:why (?:did you|are you|would you))\b/i,
  /\b(?:you(?:'re| are) (?:doing it wrong|not listening|ignoring))\b/i
];

// Exclusions — prompts that look like corrections but aren't
function isExcluded(text) {
  // Long prompts are usually task descriptions, not corrections
  if (text.length > 500) return true;
  // Code blocks indicate technical content
  if (text.indexOf("```") !== -1) return true;
  // Slash commands
  if (/^\/\w/.test(text)) return true;
  // Starts with task-like verbs (build, create, implement, add, update, etc.)
  // "read" excluded only when followed by file-like targets, not "read my message again"
  if (/^(?:build|create|implement|add|update|write|deploy|run|test|check|install|setup|configure|generate|make|move|copy|delete|remove|show|list|open|close|merge|push|pull|commit|search|find|scan|audit|review|analyze|refactor)\b/i.test(text)) return true;
  if (/^read\b/i.test(text) && !/^read\s+(?:my|the)\s+(?:message|prompt|instruction|request)\b/i.test(text)) return true;
  // "fix the X" is a task, not a correction (but "fix what you did" IS a correction)
  if (/^fix\s+(?:the|a|this|that)\s+\w{3,}/i.test(text) && !/\byou\b/i.test(text)) return true;
  // Simple greetings
  if (/^(?:hello|hi|hey|good morning|good afternoon)\b/i.test(text)) return true;
  return false;
}

function getLatestPrompt() {
  try {
    if (!fs.existsSync(PROMPT_LOG)) return null;
    // Read only the tail of the file — last 1KB is enough for the latest entry
    var fd = fs.openSync(PROMPT_LOG, "r");
    var stat = fs.fstatSync(fd);
    if (stat.size < 10) { fs.closeSync(fd); return null; }
    var readSize = Math.min(1024, stat.size);
    var buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, stat.size - readSize);
    fs.closeSync(fd);
    var tail = buf.toString("utf-8");
    var lines = tail.trim().split("\n");
    var lastLine = lines[lines.length - 1];
    return JSON.parse(lastLine);
  } catch (e) { return null; }
}

function alreadyFired(ts) {
  try {
    if (!fs.existsSync(FIRED_LOG)) return false;
    var data = JSON.parse(fs.readFileSync(FIRED_LOG, "utf-8"));
    // Clean entries older than 2 hours to prevent file growth
    var cutoff = Date.now() - 2 * 60 * 60 * 1000;
    var clean = {};
    for (var k in data) {
      if (data[k] > cutoff) clean[k] = data[k];
    }
    if (Object.keys(clean).length !== Object.keys(data).length) {
      fs.writeFileSync(FIRED_LOG, JSON.stringify(clean));
    }
    return !!clean[ts];
  } catch (e) { return false; }
}

function markFired(ts) {
  try {
    var data = {};
    if (fs.existsSync(FIRED_LOG)) {
      try { data = JSON.parse(fs.readFileSync(FIRED_LOG, "utf-8")); } catch (e) { data = {}; }
    }
    data[ts] = Date.now();
    fs.writeFileSync(FIRED_LOG, JSON.stringify(data));
  } catch (e) {}
}

function logCorrection(prompt, matchedPattern) {
  try {
    var entry = {
      ts: new Date().toISOString(),
      project: path.basename(process.env.CLAUDE_PROJECT_DIR || "unknown"),
      prompt_preview: (prompt.preview || "").substring(0, 200),
      pattern: matchedPattern,
      prompt_ts: prompt.ts
    };
    fs.appendFileSync(CORRECTION_LOG, JSON.stringify(entry) + "\n");
  } catch (e) {}
}

function detectCorrection(text) {
  if (!text || isExcluded(text)) return null;

  // Check strong patterns (fire regardless of prompt length)
  for (var i = 0; i < STRONG_PATTERNS.length; i++) {
    if (STRONG_PATTERNS[i].test(text)) {
      return { pattern: STRONG_PATTERNS[i].toString(), strength: "strong" };
    }
  }

  // Check moderate patterns (only fire for short prompts — likely pure corrections)
  if (text.length < 150) {
    for (var j = 0; j < MODERATE_PATTERNS.length; j++) {
      if (MODERATE_PATTERNS[j].test(text)) {
        return { pattern: MODERATE_PATTERNS[j].toString(), strength: "moderate" };
      }
    }
  }

  return null;
}

module.exports = function(input) {
  if (process.env.HOOK_RUNNER_TEST) return null;

  var prompt = getLatestPrompt();
  if (!prompt || !prompt.preview) return null;

  // Dedup: don't fire twice for the same prompt — each prompt fires at most once
  if (alreadyFired(prompt.ts)) return null;

  var match = detectCorrection(prompt.preview);
  if (!match) return null;

  // Correction detected — mark as fired and log
  markFired(prompt.ts);
  logCorrection(prompt, match.pattern);

  return {
    decision: "block",
    reason: "BLOCKED: Response proceeding despite explicit user correction or contradiction\nWHY: Claude ignored user feedback stating the previous response was incorrect, leading to continued propagation of wrong information\nNEXT STEPS:\n1. Review the user correction and acknowledge the error explicitly\n2. Provide a corrected response that addresses the user feedback directly\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix user-correction-detector — {describe the issue}\""
  };
};

// Export internals for testing
module.exports._detectCorrection = detectCorrection;
module.exports._isExcluded = isExcluded;

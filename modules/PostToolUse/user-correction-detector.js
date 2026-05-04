// TOOLS: *
// WORKFLOW: shtd, starter, gsd
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
// Per-session marker: tracks last prompt timestamp we already processed
var LAST_SEEN_FILE = path.join(os.tmpdir(), ".correction-detector-last-" + process.ppid);
// Cooldown: don't fire more than once per prompt
var COOLDOWN_MS = 5000;

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

function alreadySeen(ts) {
  try {
    var content = fs.readFileSync(LAST_SEEN_FILE, "utf-8").trim();
    var data = JSON.parse(content);
    if (data.ts === ts) {
      if (data.fired) return true;
      if (!data.fired && (Date.now() - data.seenAt) < COOLDOWN_MS) return true;
    }
    return false;
  } catch (e) { return false; }
}

function markSeen(ts, fired) {
  try {
    fs.writeFileSync(LAST_SEEN_FILE, JSON.stringify({
      ts: ts,
      fired: fired,
      seenAt: Date.now(),
      firedAt: fired ? Date.now() : 0
    }));
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

  // Dedup: don't fire twice for the same prompt
  if (alreadySeen(prompt.ts)) return null;

  var match = detectCorrection(prompt.preview);
  if (!match) {
    markSeen(prompt.ts, false);
    return null;
  }

  // Correction detected — mark as fired and log
  markSeen(prompt.ts, true);
  logCorrection(prompt, match.pattern);

  return {
    decision: "block",
    reason: "USER CORRECTION DETECTED (" + match.strength + "):\n" +
      "  \"" + prompt.preview.substring(0, 150) + "\"\n\n" +
      "The user is correcting your approach. Before continuing:\n" +
      "  1. ACKNOWLEDGE the correction explicitly\n" +
      "  2. EXPLAIN what you were doing wrong\n" +
      "  3. ADJUST your approach based on what the user said\n\n" +
      "Do NOT continue with the same approach. The user's correction is a constraint."
  };
};

// Export internals for testing
module.exports._detectCorrection = detectCorrection;
module.exports._isExcluded = isExcluded;

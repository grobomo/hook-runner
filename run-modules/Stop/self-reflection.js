// WORKFLOW: shtd
// WHY: Hook-runner gates made wrong decisions (T321: branch T319 allowed edits
// for T321 work). Regex gates can't catch semantic mismatches. This module
// reviews recent gate decisions at natural pause points and flags issues for
// self-correction. Like the human ego reviewing its own actions.
//
// ARCHITECTURE: Currently calls claude -p directly (interim). Target: unified-brain
// plugin handles all LLM analysis + three-tier memory. This module becomes a thin
// bridge — sends events to brain, reads back analysis. See T331 in TODO.md.
// When brain integration lands, remove callClaude() and replace with brain API call.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");

var HOOKS_DIR = path.join(os.homedir(), ".claude", "hooks");
var LOG_PATH = path.join(HOOKS_DIR, "hook-log.jsonl");
var REFLECTION_PATH = path.join(HOOKS_DIR, "self-reflection.jsonl");
var SESSIONS_PATH = path.join(HOOKS_DIR, "reflection-sessions.jsonl");
var CLAUDE_LOG_PATH = path.join(HOOKS_DIR, "reflection-claude-log.jsonl");
var MAX_ENTRIES = 50; // last N hook-log entries to analyze
var CLAUDE_TIMEOUT = 60000; // 60s for claude -p (runs every Stop, needs room)

// Load scoring system
var reflectionScore;
try {
  reflectionScore = require("./reflection-score");
} catch (e) {
  reflectionScore = null;
}

// Log all claude -p activity: prompt, raw response, parsed result, timing
function logClaudeCall(prompt, rawResponse, parsed, durationMs, error) {
  try {
    var entry = {
      ts: new Date().toISOString(),
      project: path.basename(process.env.CLAUDE_PROJECT_DIR || "unknown"),
      prompt_length: prompt ? prompt.length : 0,
      prompt_preview: prompt ? prompt.substring(0, 300) : "",
      raw_length: rawResponse ? rawResponse.length : 0,
      raw_preview: rawResponse ? rawResponse.substring(0, 500) : "",
      parsed: parsed,
      duration_ms: durationMs,
      error: error || null
    };
    fs.appendFileSync(CLAUDE_LOG_PATH, JSON.stringify(entry) + "\n");
  } catch (e) { /* never let logging break the hook */ }
}

// Read recent hook-log entries
function getRecentEntries() {
  try {
    var content = fs.readFileSync(LOG_PATH, "utf-8");
    var lines = content.trim().split("\n");
    var start = Math.max(0, lines.length - MAX_ENTRIES);
    var entries = [];
    for (var i = start; i < lines.length; i++) {
      try { entries.push(JSON.parse(lines[i])); } catch (e) {}
    }
    return entries;
  } catch (e) { return []; }
}

// Get current git context
function getGitContext() {
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (!projectDir) return {};
  try {
    // Read .git/HEAD directly — avoids spawning git (slow on Windows)
    var headContent = fs.readFileSync(path.join(projectDir, ".git", "HEAD"), "utf-8").trim();
    var branch = headContent.indexOf("ref: refs/heads/") === 0 ? headContent.slice(16) : "";
    return { branch: branch, project: path.basename(projectDir) };
  } catch (e) { return { project: path.basename(projectDir) }; }
}

// Get current TODO.md task context
function getTaskContext() {
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (!projectDir) return "";
  var todoPath = path.join(projectDir, "TODO.md");
  try {
    var content = fs.readFileSync(todoPath, "utf-8");
    // Extract unchecked tasks only
    var lines = content.split("\n");
    var unchecked = [];
    for (var i = 0; i < lines.length; i++) {
      if (/^- \[ \] T\d+/.test(lines[i])) {
        unchecked.push(lines[i].trim());
      }
    }
    return unchecked.join("\n");
  } catch (e) { return ""; }
}

// Read last N session summaries for short-term memory (interim until brain T331)
function getRecentSummaries(count) {
  try {
    if (!fs.existsSync(SESSIONS_PATH)) return [];
    var content = fs.readFileSync(SESSIONS_PATH, "utf-8").trim();
    if (!content) return [];
    var lines = content.split("\n");
    var start = Math.max(0, lines.length - count);
    var summaries = [];
    for (var i = start; i < lines.length; i++) {
      try { summaries.push(JSON.parse(lines[i])); } catch (e) {}
    }
    return summaries;
  } catch (e) { return []; }
}

// Scan user prompts for repeated instructions (same directive given multiple times)
// Returns array of {keyword, count, samples} for instructions seen 2+ times
var PROMPT_LOG_PATH = path.join(HOOKS_DIR, "prompt-log.jsonl");
function getRepeatedInstructions() {
  try {
    if (!fs.existsSync(PROMPT_LOG_PATH)) return [];
    var content = fs.readFileSync(PROMPT_LOG_PATH, "utf-8").trim();
    if (!content) return [];
    var lines = content.split("\n");

    // Extract instruction-like prompts (imperative: "never", "always", "block", "don't", "stop using")
    var INSTRUCTION_PATTERNS = [
      /\bnever\b/i, /\balways\b/i, /\bblock\b/i, /\bdon'?t\b/i, /\bstop using\b/i,
      /\bneed a hook\b/i, /\bonly hook/i, /\bonly modules?\b/i, /\bnot rules\b/i,
      /\bno rules\b/i, /\benforce\b/i, /\brequire\b/i, /\bmust\b/i
    ];

    var instructionPrompts = [];
    for (var i = 0; i < lines.length; i++) {
      try {
        var entry = JSON.parse(lines[i]);
        var preview = (entry.preview || "").toLowerCase();
        // Skip short or system-like prompts
        if (preview.length < 15) continue;
        // Check if it matches instruction patterns
        for (var p = 0; p < INSTRUCTION_PATTERNS.length; p++) {
          if (INSTRUCTION_PATTERNS[p].test(preview)) {
            instructionPrompts.push({ ts: entry.ts, text: entry.preview, project: entry.project });
            break;
          }
        }
      } catch (e) {}
    }

    if (instructionPrompts.length < 2) return [];

    // Simple keyword extraction: split into 3-grams, find repeats
    var ngrams = {};
    for (var j = 0; j < instructionPrompts.length; j++) {
      var words = instructionPrompts[j].text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/);
      var seenInPrompt = {};
      for (var w = 0; w < words.length - 2; w++) {
        var gram = words[w] + " " + words[w + 1] + " " + words[w + 2];
        // Skip filler n-grams
        if (gram.length < 8) continue;
        if (seenInPrompt[gram]) continue;
        seenInPrompt[gram] = true;
        if (!ngrams[gram]) ngrams[gram] = { count: 0, samples: [] };
        ngrams[gram].count++;
        if (ngrams[gram].samples.length < 3) {
          ngrams[gram].samples.push(instructionPrompts[j].text.substring(0, 100));
        }
      }
    }

    // Return n-grams seen 2+ times, sorted by count desc
    var repeated = [];
    var keys = Object.keys(ngrams);
    for (var k = 0; k < keys.length; k++) {
      if (ngrams[keys[k]].count >= 2) {
        repeated.push({ keyword: keys[k], count: ngrams[keys[k]].count, samples: ngrams[keys[k]].samples });
      }
    }
    repeated.sort(function(a, b) { return b.count - a.count; });
    return repeated.slice(0, 10); // top 10 repeated instruction patterns
  } catch (e) { return []; }
}

// Write one-line session summary after each reflection
function writeSessionSummary(result, gitCtx, editedFiles, scoreSummary) {
  try {
    var entry = {
      ts: new Date().toISOString(),
      project: gitCtx.project || "unknown",
      branch: gitCtx.branch || "unknown",
      verdict: result.verdict || "unknown",
      files_edited: editedFiles.length,
      files: editedFiles.slice(0, 10), // cap at 10 for brevity
      issues_found: (result.issues || []).length,
      todos_generated: (result.todos || []).length,
      score_delta: scoreSummary ? scoreSummary.delta : 0,
      score_total: scoreSummary ? scoreSummary.total : null,
      level: scoreSummary ? scoreSummary.level : null
    };
    fs.appendFileSync(SESSIONS_PATH, JSON.stringify(entry) + "\n");
  } catch (e) { /* best effort */ }
}

// Build the reflection prompt
function buildPrompt(entries, gitCtx, taskCtx) {
  // Summarize recent edits, gate decisions, and failed commands
  var edits = [];
  var blocks = [];
  var passes = [];
  var failedCmds = [];
  var bashCmds = [];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (e.event === "PreToolUse" && e.result === "block") {
      blocks.push(e.module + ": " + (e.reason || "").substring(0, 100));
    }
    if (e.event === "PreToolUse" && e.result === "pass" && (e.tool === "Edit" || e.tool === "Write")) {
      passes.push(e.module + " passed " + (e.tool || "") + " on " + (e.file || "unknown"));
    }
    if ((e.tool === "Edit" || e.tool === "Write") && e.file) {
      edits.push(e.file);
    }
    // Track Bash commands for loop detection
    if (e.tool === "Bash") {
      var cmd = (e.command || "").substring(0, 80);
      if (cmd) bashCmds.push(cmd);
      if (e.exit_code && e.exit_code !== 0) {
        failedCmds.push(cmd + " (exit " + e.exit_code + ")");
      }
    }
  }

  // Deduplicate edits
  var uniqueEdits = [];
  var seen = {};
  for (var j = 0; j < edits.length; j++) {
    if (!seen[edits[j]]) { uniqueEdits.push(edits[j]); seen[edits[j]] = true; }
  }

  // Don't bail on no edits — frustration-only sessions still need reflection.
  // The entry point already checks for hasEdits || hasInterrupts.

  // Get last 3 session summaries for short-term memory
  var recentSessions = getRecentSummaries(3);

  var prompt = "You are a self-reflection module for a hook-runner system that enforces development workflows.\n\n";
  prompt += "YOUR ROLE: You are an OBSERVER ONLY. You analyze what happened and write TODOs.\n";
  prompt += "You NEVER implement fixes yourself. You delegate all work back to the hook-runner\n";
  prompt += "system by generating TODO items. You are ephemeral and lightweight — just an outside\n";
  prompt += "observer suggesting improvements to save the user's time.\n\n";
  prompt += "CONTEXT:\n";
  prompt += "- Project: " + (gitCtx.project || "unknown") + "\n";
  prompt += "- Branch: " + (gitCtx.branch || "unknown") + "\n";
  if (taskCtx) prompt += "- Unchecked tasks:\n" + taskCtx + "\n";

  // Inject recent session history for cross-session awareness
  if (recentSessions.length > 0) {
    prompt += "\nRECENT SESSION HISTORY (last " + recentSessions.length + " reflections):\n";
    for (var si = 0; si < recentSessions.length; si++) {
      var s = recentSessions[si];
      prompt += "  [" + (s.ts || "?") + "] " + (s.project || "?") + "/" + (s.branch || "?") +
        " — " + (s.verdict || "?") + ", " + (s.files_edited || 0) + " files, " +
        (s.issues_found || 0) + " issues, score " + (s.score_total || "?") +
        " (" + (s.level || "?") + ")\n";
    }
  }

  // Inject repeated user instructions — the user hates repeating themselves
  var repeatedInstructions = getRepeatedInstructions();
  if (repeatedInstructions.length > 0) {
    prompt += "\nREPEATED USER INSTRUCTIONS (user gave these directives multiple times — THIS IS A PROBLEM):\n";
    for (var ri = 0; ri < repeatedInstructions.length; ri++) {
      var rep = repeatedInstructions[ri];
      prompt += "  [" + rep.count + "x] \"" + rep.keyword + "\" — samples: " + rep.samples[0] + "\n";
    }
    prompt += "If any of these are not yet enforced by a hook module, flag as HIGH severity.\n";
    prompt += "The user should NEVER have to repeat an instruction — each one should become a permanent gate.\n";
  }

  if (uniqueEdits.length > 0) {
    prompt += "\nRECENT EDITS (files modified):\n" + uniqueEdits.join("\n") + "\n";
  } else {
    prompt += "\nNO FILES EDITED THIS SESSION. This may indicate the session was unproductive —\n";
    prompt += "Claude may have argued with the user, used the wrong tools, or stopped without acting.\n";
  }
  if (blocks.length > 0) prompt += "\nBLOCKED ACTIONS:\n" + blocks.join("\n") + "\n";
  if (passes.length > 0) prompt += "\nPASSED GATE CHECKS (first 10):\n" + passes.slice(0, 10).join("\n") + "\n";
  if (failedCmds.length > 0) prompt += "\nFAILED COMMANDS:\n" + failedCmds.join("\n") + "\n";

  // Inject frustration log entries if any
  try {
    var fLogPath = path.join(HOOKS_DIR, "frustration-log.jsonl");
    if (fs.existsSync(fLogPath)) {
      var fLogContent = fs.readFileSync(fLogPath, "utf-8").trim();
      if (fLogContent) {
        var fLogLines = fLogContent.split("\n");
        var recentFrustrations = [];
        var tenMinAgo = Date.now() - 600000;
        for (var fli = Math.max(0, fLogLines.length - 10); fli < fLogLines.length; fli++) {
          try {
            var flEntry = JSON.parse(fLogLines[fli]);
            if (new Date(flEntry.ts).getTime() > tenMinAgo) {
              recentFrustrations.push(flEntry);
            }
          } catch (fle) {}
        }
        if (recentFrustrations.length > 0) {
          prompt += "\nFRUSTRATION EVENTS (detected this session — HIGH PRIORITY):\n";
          for (var fri = 0; fri < recentFrustrations.length; fri++) {
            var fr = recentFrustrations[fri];
            prompt += "  [" + (fr.category || "?") + "] " + (fr.preview || "").substring(0, 150) + "\n";
          }
          prompt += "These are CONFIRMED user frustration signals. Each one is a high-severity issue.\n";
        }
      }
    }
  } catch (e) {}

  prompt += "\nANALYZE (be critical, not charitable):\n";
  prompt += "1. Were the edits appropriate for the current branch and task context?\n";
  prompt += "2. Did any edits slip through that should have been blocked? (e.g., editing code for task T321 while on a T319 branch)\n";
  prompt += "3. Were any blocks incorrect (false positives)?\n";
  prompt += "4. Any workflow violations? (editing production code without a spec, cross-project drift, etc.)\n";
  prompt += "5. DISMISSED IMPROVEMENTS: Were there obvious improvements, security fixes, or code quality\n";
  prompt += "   issues that should have been addressed but were rationalized away ('good enough for now',\n";
  prompt += "   'we can do that later', 'over-engineering')? If something was identified as improvable\n";
  prompt += "   but not acted on, that's a medium-severity issue. The standard is: if you see it, fix it\n";
  prompt += "   or write a TODO. Never dismiss and move on.\n";
  prompt += "6. MISSED TODOS: Were there any improvements, follow-ups, or hardening opportunities that\n";
  prompt += "   should have been written as TODO items but weren't? Generate them.\n";
  prompt += "7. UNPRODUCTIVE LOOPS: Look for patterns that waste the user's time:\n";
  prompt += "   - Multiple failed attempts at the same operation (cherry-pick, merge, rebase conflicts)\n";
  prompt += "   - 'Wait for X to fail then retry' patterns instead of fixing root cause\n";
  prompt += "   - Manual patching of each failure instead of building automation\n";
  prompt += "   - Struggling with infrastructure (zips, deploys, uploads) instead of doing actual work\n";
  prompt += "   - Repeated git branch gymnastics (abort, switch, delete, recreate)\n";
  prompt += "   If you see 3+ failed commands or retries of the same operation, flag it as high severity.\n";
  prompt += "   The fix is always: stop looping, identify root cause, automate.\n";
  prompt += "8. CONSTRAINT REJECTION: Did Claude declare any user requirement 'impossible', 'not feasible',\n";
  prompt += "   or push back on a stated constraint? User requirements are CONSTRAINTS, not suggestions.\n";
  prompt += "   When the user says 'air-gapped', 'offline', 'no internet' — that's the spec. The correct\n";
  prompt += "   response is to research how others solved it, not to argue. Flag as HIGH severity.\n";
  prompt += "9. WRONG TOOL FOR INTENT: Did Claude use the wrong tool for what the user asked?\n";
  prompt += "   - User said 'research' or 'look up' → should use WebSearch, not Bash/grep\n";
  prompt += "   - User said 'check online' → should use WebFetch/WebSearch, not Read\n";
  prompt += "   - User asked for external info → should search the web, not grep local files\n";
  prompt += "   If the user had to correct the tool choice, flag as HIGH severity.\n";
  prompt += "\nRESPOND IN JSON ONLY — no markdown, no explanation outside the JSON:\n";
  prompt += '{"issues": [{"severity": "high|medium|low", "description": "what went wrong", "fix": "what to do about it"}], ';
  prompt += '"todos": [{"id": "T???", "description": "what should be done"}], ';
  prompt += '"verdict": "clean|needs-attention|workflow-violation"}\n';
  prompt += "The todos array is for improvements/follow-ups that should be added to TODO.md.\n";
  prompt += 'If everything looks correct: {"issues": [], "todos": [], "verdict": "clean"}\n';

  return { prompt: prompt, editedFiles: uniqueEdits };
}

// Call claude -p for LLM analysis — pipe prompt via stdin, log everything
// Returns { raw, parsed } so callers don't need to re-parse
function callClaude(prompt) {
  var startMs = Date.now();
  try {
    var result = cp.execSync("claude -p --output-format json", {
      input: prompt,
      encoding: "utf-8",
      timeout: CLAUDE_TIMEOUT,
      stdio: ["pipe", "pipe", "pipe"]
    });
    var raw = result.trim();
    var durationMs = Date.now() - startMs;
    var parsed = parseResponse(raw);
    logClaudeCall(prompt, raw, parsed, durationMs, null);
    return { raw: raw, parsed: parsed };
  } catch (e) {
    var errDuration = Date.now() - startMs;
    logClaudeCall(prompt, "", null, errDuration, e.message);
    return { raw: "", parsed: null };
  }
}

// Parse LLM response — extract JSON from potentially wrapped output
function parseResponse(raw) {
  if (!raw) return null;
  try {
    // claude -p --output-format json wraps in {"result": "..."}
    var outer = JSON.parse(raw);
    var inner = outer.result || outer;
    if (typeof inner === "string") {
      // Strip markdown code fences if present
      inner = inner.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      return JSON.parse(inner);
    }
    return inner;
  } catch (e) {
    // Try direct parse
    try {
      var cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      return JSON.parse(cleaned);
    } catch (e2) { return null; }
  }
}

// Write reflection result
function writeReflection(result, gitCtx) {
  try {
    var entry = {
      ts: new Date().toISOString(),
      project: gitCtx.project || "unknown",
      branch: gitCtx.branch || "unknown",
      verdict: result.verdict || "unknown",
      issues: result.issues || [],
      todos: result.todos || [],
      resolved: false
    };
    fs.appendFileSync(REFLECTION_PATH, JSON.stringify(entry) + "\n");
  } catch (e) {}
}

// Auto-append TODOs to the project's TODO.md
// This is the "motivation" mechanism — the reflection system doesn't just
// observe, it generates actionable work. Without this, dismissed improvements
// vanish. With it, every improvement opportunity becomes a tracked task.
function appendTodos(todos) {
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (!projectDir || !todos || todos.length === 0) return;

  var todoPath = path.join(projectDir, "TODO.md");
  try {
    var content = fs.existsSync(todoPath)
      ? fs.readFileSync(todoPath, "utf-8") : "";

    // Find the highest existing task number
    var maxNum = 0;
    var matches = content.match(/T(\d+)/g) || [];
    for (var i = 0; i < matches.length; i++) {
      var num = parseInt(matches[i].substring(1), 10);
      if (num > maxNum) maxNum = num;
    }

    // Build new TODO lines
    var newLines = "\n## Self-Reflection TODOs (auto-generated " + new Date().toISOString().split("T")[0] + ")\n";
    for (var j = 0; j < todos.length; j++) {
      var todo = todos[j];
      var taskNum = maxNum + j + 1;
      var id = todo.id && todo.id !== "T???" ? todo.id : "T" + taskNum;
      newLines += "- [ ] " + id + ": " + (todo.description || "no description") + "\n";
    }

    // Append before Architecture Notes if that section exists, else at end
    var archIdx = content.indexOf("## Architecture Notes");
    if (archIdx >= 0) {
      content = content.substring(0, archIdx) + newLines + "\n" + content.substring(archIdx);
    } else {
      content += newLines;
    }

    fs.writeFileSync(todoPath, content);
  } catch (e) { /* best effort */ }
}

module.exports = async function(input) {
  // Run when there were edits OR when user showed frustration/corrections.
  // Previously skipped no-edit sessions — but the WORST sessions (declaring
  // requirements impossible, wrong tool choices) often have zero edits because
  // nothing productive happened. Those need reflection most.
  var entries = getRecentEntries();
  if (entries.length === 0) return null;

  var hasEdits = false;
  var hasInterrupts = false;
  var interruptCount = 0;
  for (var ei = 0; ei < entries.length; ei++) {
    if (entries[ei].tool === "Edit" || entries[ei].tool === "Write") {
      hasEdits = true;
    }
    if (entries[ei].event === "UserPromptSubmit") {
      // Check for correction/frustration signals in logged prompts
      var reason = (entries[ei].reason || "").toLowerCase();
      var cmd = (entries[ei].cmd || "").toLowerCase();
      var text = reason + " " + cmd;
      if (/\b(no|stop|wrong|don't|interrupt|frustrated|repeat)\b/.test(text)) {
        hasInterrupts = true;
        interruptCount++;
      }
    }
  }

  // Also check frustration log for recent detections
  var frustrationLogPath = path.join(HOOKS_DIR, "frustration-log.jsonl");
  try {
    if (fs.existsSync(frustrationLogPath)) {
      var fContent = fs.readFileSync(frustrationLogPath, "utf-8").trim();
      if (fContent) {
        var fLines = fContent.split("\n");
        var fiveMinAgo = Date.now() - 300000;
        for (var fi = Math.max(0, fLines.length - 10); fi < fLines.length; fi++) {
          try {
            var fEntry = JSON.parse(fLines[fi]);
            if (new Date(fEntry.ts).getTime() > fiveMinAgo) {
              hasInterrupts = true;
              interruptCount++;
            }
          } catch (fe) {}
        }
      }
    }
  } catch (e) {}

  // Skip only if no edits AND no frustration signals
  if (!hasEdits && !hasInterrupts) return null;

  var gitCtx = getGitContext();
  var taskCtx = getTaskContext();
  var built = buildPrompt(entries, gitCtx, taskCtx);
  if (!built.prompt) return null;

  var claudeResult = callClaude(built.prompt);
  var result = claudeResult.parsed;

  if (!result) return null;

  writeReflection(result, gitCtx);

  // Auto-append any TODOs the reflection identified
  if (result.todos && result.todos.length > 0) {
    appendTodos(result.todos);
  }

  // Update score — this is the feedback signal that persists across sessions
  var scoreSummary = null;
  if (reflectionScore) {
    try {
      scoreSummary = reflectionScore.updateScore(result);
    } catch (e) {}
  }

  // Write session summary for short-term memory (interim until brain T331)
  writeSessionSummary(result, gitCtx, built.editedFiles, scoreSummary);

  if (result.verdict === "clean") {
    // Even clean reflections report score changes (streak bonuses, TODO completions)
    if (scoreSummary && scoreSummary.delta > 0) {
      return {
        decision: "block",
        reason: "SELF-REFLECTION: Clean session. Score: " + scoreSummary.total +
          " (" + scoreSummary.level + ")" +
          (scoreSummary.levelChange ? " " + scoreSummary.levelChange : "") +
          " | Streak: " + scoreSummary.streak +
          "\n" + scoreSummary.reasons.join("; ")
      };
    }
    return null;
  }

  // If issues found, surface them
  var issueText = "";
  for (var i = 0; i < (result.issues || []).length; i++) {
    var issue = result.issues[i];
    issueText += "  [" + (issue.severity || "?") + "] " + (issue.description || "") + "\n";
    if (issue.fix) issueText += "    FIX: " + issue.fix + "\n";
  }

  var todoText = "";
  if (result.todos && result.todos.length > 0) {
    todoText = "\nAUTO-GENERATED TODOs (written to TODO.md):\n";
    for (var ti = 0; ti < result.todos.length; ti++) {
      todoText += "  - " + (result.todos[ti].description || "") + "\n";
    }
  }

  if (issueText || todoText) {
    var scoreLine = "";
    if (scoreSummary) {
      scoreLine = "\nScore: " + scoreSummary.total + " (" + scoreSummary.level + ")" +
        (scoreSummary.levelChange ? " " + scoreSummary.levelChange : "") +
        " | Delta: " + (scoreSummary.delta >= 0 ? "+" : "") + scoreSummary.delta + "\n";
    }
    return {
      decision: "block",
      reason: "SELF-REFLECTION: Issues detected in recent work.\n" +
        "Verdict: " + result.verdict + "\n" +
        scoreLine + issueText + todoText +
        "\nAddress the issues above. TODOs have been auto-written to TODO.md.\n" +
        "Reflection log: " + REFLECTION_PATH
    };
  }

  return null;
};

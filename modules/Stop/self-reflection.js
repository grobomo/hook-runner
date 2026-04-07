// WORKFLOW: shtd
// WHY: Hook-runner gates made wrong decisions (T321: branch T319 allowed edits
// for T321 work). Regex gates can't catch semantic mismatches. This module calls
// claude -p at natural pause points to review recent gate decisions and flag
// issues for self-correction. Like the human ego reviewing its own actions.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");

var HOOKS_DIR = path.join(os.homedir(), ".claude", "hooks");
var LOG_PATH = path.join(HOOKS_DIR, "hook-log.jsonl");
var REFLECTION_PATH = path.join(HOOKS_DIR, "self-reflection.jsonl");
var RATE_LIMIT_PATH = path.join(HOOKS_DIR, ".reflection-last-run");
var MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes between reflections
var MAX_ENTRIES = 50; // last N hook-log entries to analyze
var CLAUDE_TIMEOUT = 30000; // 30s for claude -p

// Rate limit: skip if ran recently
function shouldSkip() {
  try {
    var lastRun = fs.readFileSync(RATE_LIMIT_PATH, "utf-8").trim();
    var elapsed = Date.now() - new Date(lastRun).getTime();
    if (elapsed < MIN_INTERVAL_MS) return true;
  } catch (e) { /* no file = never ran */ }
  return false;
}

function markRun() {
  try { fs.writeFileSync(RATE_LIMIT_PATH, new Date().toISOString()); } catch (e) {}
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
    var branch = cp.execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: projectDir, encoding: "utf-8", timeout: 3000
    }).trim();
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

// Build the reflection prompt
function buildPrompt(entries, gitCtx, taskCtx) {
  // Summarize recent edits and gate decisions
  var edits = [];
  var blocks = [];
  var passes = [];
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
  }

  // Deduplicate edits
  var uniqueEdits = [];
  var seen = {};
  for (var j = 0; j < edits.length; j++) {
    if (!seen[edits[j]]) { uniqueEdits.push(edits[j]); seen[edits[j]] = true; }
  }

  if (uniqueEdits.length === 0) return ""; // Nothing to reflect on

  var prompt = "You are a self-reflection module for a hook-runner system that enforces development workflows.\n\n";
  prompt += "CONTEXT:\n";
  prompt += "- Project: " + (gitCtx.project || "unknown") + "\n";
  prompt += "- Branch: " + (gitCtx.branch || "unknown") + "\n";
  if (taskCtx) prompt += "- Unchecked tasks:\n" + taskCtx + "\n";
  prompt += "\nRECENT EDITS (files modified):\n" + uniqueEdits.join("\n") + "\n";
  if (blocks.length > 0) prompt += "\nBLOCKED ACTIONS:\n" + blocks.join("\n") + "\n";
  if (passes.length > 0) prompt += "\nPASSED GATE CHECKS (first 10):\n" + passes.slice(0, 10).join("\n") + "\n";

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
  prompt += "\nRESPOND IN JSON ONLY — no markdown, no explanation outside the JSON:\n";
  prompt += '{"issues": [{"severity": "high|medium|low", "description": "what went wrong", "fix": "what to do about it"}], ';
  prompt += '"todos": [{"id": "T???", "description": "what should be done"}], ';
  prompt += '"verdict": "clean|needs-attention|workflow-violation"}\n';
  prompt += "The todos array is for improvements/follow-ups that should be added to TODO.md.\n";
  prompt += 'If everything looks correct: {"issues": [], "todos": [], "verdict": "clean"}\n';

  return prompt;
}

// Call claude -p for LLM analysis — pipe prompt via stdin to avoid shell escaping issues
function callClaude(prompt) {
  try {
    var result = cp.execSync("claude -p --output-format json", {
      input: prompt,
      encoding: "utf-8",
      timeout: CLAUDE_TIMEOUT,
      stdio: ["pipe", "pipe", "pipe"]
    });
    return result.trim();
  } catch (e) {
    return "";
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
  // Only reflect at natural pause points
  if (shouldSkip()) return null;
  markRun();

  var entries = getRecentEntries();
  if (entries.length === 0) return null;

  var gitCtx = getGitContext();
  var taskCtx = getTaskContext();
  var prompt = buildPrompt(entries, gitCtx, taskCtx);
  if (!prompt) return null;

  var raw = callClaude(prompt);
  var result = parseResponse(raw);

  if (!result) return null;

  writeReflection(result, gitCtx);

  // Auto-append any TODOs the reflection identified
  if (result.todos && result.todos.length > 0) {
    appendTodos(result.todos);
  }

  if (result.verdict === "clean") return null;

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
    return {
      decision: "block",
      reason: "SELF-REFLECTION: Issues detected in recent work.\n" +
        "Verdict: " + result.verdict + "\n" +
        issueText + todoText +
        "\nAddress the issues above. TODOs have been auto-written to TODO.md.\n" +
        "Reflection log: " + REFLECTION_PATH
    };
  }

  return null;
};

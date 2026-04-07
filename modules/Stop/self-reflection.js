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

  prompt += "\nANALYZE:\n";
  prompt += "1. Were the edits appropriate for the current branch and task context?\n";
  prompt += "2. Did any edits slip through that should have been blocked? (e.g., editing code for task T321 while on a T319 branch)\n";
  prompt += "3. Were any blocks incorrect (false positives)?\n";
  prompt += "4. Any workflow violations? (editing production code without a spec, cross-project drift, etc.)\n";
  prompt += "\nRESPOND IN JSON ONLY — no markdown, no explanation outside the JSON:\n";
  prompt += '{"issues": [{"severity": "high|medium|low", "description": "what went wrong", "fix": "what to do about it"}], "verdict": "clean|needs-attention|workflow-violation"}\n';
  prompt += 'If everything looks correct, return: {"issues": [], "verdict": "clean"}\n';

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
      resolved: false
    };
    fs.appendFileSync(REFLECTION_PATH, JSON.stringify(entry) + "\n");
  } catch (e) {}
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

  if (result.verdict === "clean") return null;

  // If issues found, surface them
  var issueText = "";
  for (var i = 0; i < (result.issues || []).length; i++) {
    var issue = result.issues[i];
    issueText += "  [" + (issue.severity || "?") + "] " + (issue.description || "") + "\n";
    if (issue.fix) issueText += "    FIX: " + issue.fix + "\n";
  }

  if (issueText) {
    return {
      decision: "block",
      reason: "SELF-REFLECTION: Issues detected in recent work.\n" +
        "Verdict: " + result.verdict + "\n" +
        issueText +
        "\nReview and address these before continuing. The reflection log is at:\n" +
        REFLECTION_PATH
    };
  }

  return null;
};

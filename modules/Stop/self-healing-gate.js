// WORKFLOW: haiku-rules
// BLOCKING: true
// TOOLS: Stop
// WHY: Module errors, missing files, and config drift went undetected between sessions.
// T747 (missing hook-debug.js) broke stop hooks for an entire day before anyone noticed.
// This gate detects issues from the session's hook log and writes structured lessons
// to a hierarchical file system for recall across sessions.
//
// INCIDENT HISTORY:
// 2026-05-29: T747 — hook-debug.js missing from ~/.claude/hooks/ crashed run-stop.js.
//   Stop hooks completely broken for ~24h. No alert, no detection, no self-repair.
// 2026-05-30: T755 — user prompt "(not available)" in every stop event for weeks.
//   readLastFromTranscript searched only 30 lines back, missing tool_result entries.
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || process.env.USERPROFILE || "/home/ubu";
var HOOKS_DIR = path.join(HOME, ".claude", "hooks");
var HEALING_DIR = path.join(HOOKS_DIR, "self-healing");
var HOOK_LOG = path.join(HOOKS_DIR, "hook-log.jsonl");

// --- Logging ---
function _log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "self-healing-gate";
  entry.event = "Stop";
  try { fs.appendFileSync(HOOK_LOG, JSON.stringify(entry) + "\n"); } catch (e) {}
}

// --- Category taxonomy (hierarchical, multi-level) ---
var CATEGORIES = {
  "transcript": ["user-prompt", "assistant-response", "format-change", "path-resolution"],
  "module": ["load-failure", "require-missing", "syntax-error", "timeout", "null-return"],
  "config": ["workflow-disabled", "settings-corrupted", "file-missing", "permission"],
  "runtime": ["crash", "exit-code", "signal-kill", "memory"],
  "gate": ["false-positive", "false-negative", "message-quality", "performance"]
};

// --- Hierarchical lesson storage ---
function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
}

function getLessonPath(category, subcategory) {
  return path.join(HEALING_DIR, "lessons", category, (subcategory || "general") + ".jsonl");
}

function getIndexPath() {
  return path.join(HEALING_DIR, "index.json");
}

// --- Issue detection from hook log ---
function detectIssues() {
  var issues = [];
  if (!fs.existsSync(HOOK_LOG)) return issues;

  try {
    var lines = fs.readFileSync(HOOK_LOG, "utf-8").trim().split("\n");
    var recent = lines.slice(-100);

    for (var i = 0; i < recent.length; i++) {
      try {
        var entry = JSON.parse(recent[i]);

        // Module load errors
        if (entry.result === "error" || entry.error) {
          issues.push({
            category: "module",
            subcategory: entry.error && /require|MODULE_NOT_FOUND/i.test(entry.error) ? "require-missing" : "load-failure",
            detail: (entry.module || "unknown") + ": " + (entry.error || entry.reason || "unknown error").slice(0, 200),
            source: entry
          });
        }

        // Slow modules (>2s)
        if (entry.ms && entry.ms > 2000 && entry.module) {
          issues.push({
            category: "gate",
            subcategory: "performance",
            detail: entry.module + " took " + entry.ms + "ms",
            source: entry
          });
        }
      } catch (e) {}
    }

    // User prompt unavailability
    for (var s = 0; s < recent.length; s++) {
      try {
        var se = JSON.parse(recent[s]);
        if (se.event === "Stop" && se.user_prompt === "(not available)") {
          issues.push({
            category: "transcript",
            subcategory: "user-prompt",
            detail: "User prompt unavailable in stop event (" + (se.module || "") + ")",
            source: se
          });
        }
      } catch (e) {}
    }

    // Deduplicate by category+subcategory+detail prefix
    var seen = {};
    issues = issues.filter(function(issue) {
      var key = issue.category + "/" + issue.subcategory + "/" + issue.detail.slice(0, 50);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  } catch (e) {}

  return issues;
}

// --- L1 classification (Haiku — fast, cheap) ---
function classifyIssue(issue) {
  try {
    var haiku = require(path.join(HOOKS_DIR, "haiku-client"));
    var result = haiku.call({
      prompt: "Classify this hook-runner issue. Return JSON only.\n\n" +
        "Issue: " + issue.detail + "\n" +
        "Category: " + issue.category + "/" + issue.subcategory + "\n\n" +
        "Return: {\"fixable\": true/false, \"severity\": \"low/medium/high\", " +
        "\"fix_type\": \"config/code/restart/manual\", " +
        "\"summary\": \"one-line summary\"}",
      caller: "self-healing-gate",
      jsonMode: true,
      maxTokens: 200,
      timeoutMs: 5000
    });
    if (result.ok && result.parsed) return result.parsed;
  } catch (e) {}
  return { fixable: false, severity: "unknown", fix_type: "manual", summary: issue.detail.slice(0, 80) };
}

// --- Write lesson to hierarchical store ---
function writeLesson(category, subcategory, lesson) {
  var lessonPath = getLessonPath(category, subcategory);
  ensureDir(path.dirname(lessonPath));

  var entry = {
    ts: new Date().toISOString(),
    session: (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8),
    category: category,
    subcategory: subcategory,
    issue: lesson.issue,
    classification: lesson.classification,
    fix_applied: lesson.fix_applied || null,
    why: lesson.why || "",
    outcome: lesson.outcome || "pending"
  };

  try {
    fs.appendFileSync(lessonPath, JSON.stringify(entry) + "\n");
    updateIndex(category, subcategory, entry);
  } catch (e) {}
}

// --- Hierarchical index (multi-level fast lookup) ---
// Maps category paths to lesson counts, recent fixes, and frequency.
// Like a weighted tree: frequent issues bubble up in recall queries.
function updateIndex(category, subcategory, entry) {
  var indexPath = getIndexPath();
  ensureDir(path.dirname(indexPath));

  var index = {};
  try { index = JSON.parse(fs.readFileSync(indexPath, "utf-8")); } catch (e) {}

  var key = category + "/" + subcategory;
  if (!index[key]) {
    index[key] = { count: 0, first_seen: entry.ts, fixes: [] };
  }
  index[key].count++;
  index[key].last_ts = entry.ts;
  index[key].last_session = entry.session;
  if (entry.fix_applied) {
    index[key].last_fix = entry.fix_applied;
    index[key].fixes.push({ ts: entry.ts, fix: entry.fix_applied, why: entry.why });
    if (index[key].fixes.length > 5) index[key].fixes = index[key].fixes.slice(-5);
  }

  // Aggregate stats per top-level category
  var catKey = category + "/_stats";
  if (!index[catKey]) index[catKey] = { total: 0, subcategories: [] };
  index[catKey].total++;
  if (index[catKey].subcategories.indexOf(subcategory) === -1) {
    index[catKey].subcategories.push(subcategory);
  }

  try { fs.writeFileSync(indexPath, JSON.stringify(index, null, 2)); } catch (e) {}
}

// --- Recall: find lessons by category path ---
// Supports: exact ("module/load-failure"), prefix ("module"), wildcard ("*")
// Returns sorted by frequency (most recurring first) — like weighted tree traversal.
function recallLessons(categoryPath, limit) {
  limit = limit || 10;
  try {
    var index = JSON.parse(fs.readFileSync(getIndexPath(), "utf-8"));
    var results = [];
    var keys = Object.keys(index);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf("_stats") !== -1) continue;
      if (categoryPath === "*" || keys[i] === categoryPath || keys[i].indexOf(categoryPath + "/") === 0) {
        results.push({ path: keys[i], data: index[keys[i]] });
      }
    }
    results.sort(function(a, b) { return b.data.count - a.data.count; });
    return results.slice(0, limit);
  } catch (e) {}
  return [];
}

// --- Main ---
module.exports = function(input) {
  if (process.env.HOOK_RUNNER_TEST === "1") return null;

  var issues = detectIssues();
  _log({ result: "scan", issues_found: issues.length });

  if (issues.length === 0) {
    return {
      decision: "block",
      reason: "SELF-CHECK [self-healing]: DONE — No issues detected in hook log. System healthy.\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix self-healing-gate — {describe the issue}\""
    };
  }

  // Classify and record each issue (max 5 per stop)
  var classified = [];
  var fixableCount = 0;

  for (var i = 0; i < Math.min(issues.length, 5); i++) {
    var issue = issues[i];
    var classification = classifyIssue(issue);

    writeLesson(issue.category, issue.subcategory, {
      issue: issue.detail,
      classification: classification,
      why: "Detected during stop-hook self-healing scan"
    });

    classified.push({
      path: issue.category + "/" + issue.subcategory,
      detail: issue.detail.slice(0, 100),
      fixable: classification.fixable,
      severity: classification.severity
    });

    if (classification.fixable) fixableCount++;
  }

  _log({ result: "classified", total: issues.length, fixable: fixableCount });

  // T807: Write findings to well-known file for SessionStart health-report to surface
  var FINDINGS_PATH = path.join(HOOKS_DIR, ".self-healing-findings.json");
  try {
    fs.writeFileSync(FINDINGS_PATH, JSON.stringify({
      ts: new Date().toISOString(),
      session: (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8),
      total: issues.length,
      fixable: fixableCount,
      issues: classified.slice(0, 5)
    }));
  } catch (e) { /* best effort */ }

  // Build summary from index
  var recentLessons = recallLessons("*", 5);
  var recallSummary = recentLessons.length > 0
    ? "\nRecurring: " + recentLessons.map(function(r) { return r.path + " (" + r.data.count + "x)"; }).join(", ")
    : "";

  return {
    decision: "block",
    reason: "SELF-CHECK [self-healing]: \nFALSE POSITIVE? File a TODO in hook-runner: \"Fix self-healing-gate — {describe the issue}\"" + (fixableCount > 0 ? "CONTINUE" : "DONE") +
      " — " + issues.length + " issue(s) detected, " + fixableCount + " fixable." +
      "\nIssues: " + classified.map(function(c) { return c.path + ": " + c.detail; }).slice(0, 3).join("; ") +
      recallSummary +
      (fixableCount > 0 ? "\nNEXT: Review self-healing/index.json and apply fixes." : "")
  };
};

// --- CLI: query lessons ---
if (require.main === module) {
  var cmd = process.argv[2] || "status";
  if (cmd === "status") {
    var index = {};
    try { index = JSON.parse(fs.readFileSync(getIndexPath(), "utf-8")); } catch (e) {}
    var keys = Object.keys(index).filter(function(k) { return k.indexOf("_stats") === -1; });
    console.log("=== Self-Healing Lesson Index ===");
    console.log("Categories: " + Object.keys(CATEGORIES).join(", "));
    console.log("Lessons stored: " + keys.length + " paths");
    keys.sort(function(a, b) { return (index[b].count || 0) - (index[a].count || 0); });
    for (var i = 0; i < Math.min(keys.length, 15); i++) {
      var d = index[keys[i]];
      console.log("  " + keys[i] + ": " + d.count + "x (last: " + (d.last_ts || "?").slice(0, 19) + ")");
    }
  } else if (cmd === "recall") {
    var query = process.argv[3] || "*";
    var results = recallLessons(query, 20);
    console.log("=== Recall: " + query + " ===");
    for (var j = 0; j < results.length; j++) {
      var r = results[j];
      console.log("  " + r.path + ": " + r.data.count + "x" +
        (r.data.last_fix ? " (last fix: " + r.data.last_fix + ")" : ""));
    }
  } else if (cmd === "lessons") {
    var cat = process.argv[3] || "";
    var sub = process.argv[4] || "general";
    var lp = getLessonPath(cat, sub);
    if (fs.existsSync(lp)) {
      var ll = fs.readFileSync(lp, "utf-8").trim().split("\n");
      console.log("=== Lessons: " + cat + "/" + sub + " (" + ll.length + " entries) ===");
      var tail = ll.slice(-10);
      for (var k = 0; k < tail.length; k++) {
        try {
          var e = JSON.parse(tail[k]);
          console.log("  " + e.ts.slice(0, 19) + " | " + e.issue.slice(0, 80));
        } catch (ex) {}
      }
    } else {
      console.log("No lessons at " + cat + "/" + sub);
    }
  } else {
    console.log("Usage: node self-healing-gate.js [status|recall <path>|lessons <cat> <sub>]");
  }
}

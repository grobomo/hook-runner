// TOOLS: Bash, Edit, Write
// WORKFLOW: shtd, starter, haiku-rules
// WHY: Self-healing detects anomalies (crashes, OOMs, tab accumulation) but findings
// evaporate between sessions. Without a written RCA, the same incident repeats.
// T822: Emit stderr reminder to write an RCA when self-healing lessons exist
// without a corresponding docs/rca/ file.
//
// INCIDENT HISTORY:
// 2026-06-02: T822 — self-healing lessons accumulated in lessons/ dirs but no session
//   ever wrote a formal RCA. Same crashes repeated across 3+ sessions before anyone
//   noticed the pattern. RCA writing was always "I'll do it later" and never happened.
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var HEALING_DIR = path.join(HOME, ".claude", "hooks", "self-healing", "lessons");
var PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
var HOOK_LOG = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");

// Debounce: only remind once per session (flag file)
var FLAG = path.join(HOME, ".claude", "hooks", ".rca-reminded");

function log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "rca-write-check";
  entry.event = "PostToolUse";
  try { fs.appendFileSync(HOOK_LOG, JSON.stringify(entry) + "\n"); } catch (e) {}
}

module.exports = function(input) {
  // Only check periodically — after Bash/Edit/Write tool calls
  var tool = (input || {}).tool_name;
  if (tool !== "Bash" && tool !== "Edit" && tool !== "Write") return null;

  // Debounce: already reminded this session
  try {
    if (fs.existsSync(FLAG)) {
      var stat = fs.statSync(FLAG);
      var ageMs = Date.now() - stat.mtimeMs;
      // Re-check every 30 minutes
      if (ageMs < 30 * 60 * 1000) return null;
    }
  } catch (e) {}

  // Check for recent self-healing lessons (last 2 hours)
  var recentLessons = [];
  try {
    if (!fs.existsSync(HEALING_DIR)) return null;
    var categories = fs.readdirSync(HEALING_DIR);
    var cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (var i = 0; i < categories.length; i++) {
      var catDir = path.join(HEALING_DIR, categories[i]);
      try {
        var st = fs.statSync(catDir);
        if (!st.isDirectory()) continue;
      } catch (e) { continue; }
      var files = fs.readdirSync(catDir);
      for (var j = 0; j < files.length; j++) {
        if (!/\.jsonl$/.test(files[j])) continue;
        var fp = path.join(catDir, files[j]);
        try {
          var fstat = fs.statSync(fp);
          if (fstat.mtimeMs < cutoff) continue;
          // Read last few lines for recent entries
          var content = fs.readFileSync(fp, "utf-8").trim();
          if (!content) continue;
          var lines = content.split("\n").slice(-5);
          for (var k = 0; k < lines.length; k++) {
            try {
              var entry = JSON.parse(lines[k]);
              if (entry.ts) {
                var entryTs = new Date(entry.ts).getTime();
                if (entryTs > cutoff) {
                  recentLessons.push({
                    category: categories[i],
                    subcategory: files[j].replace(/\.jsonl$/, ""),
                    summary: entry.summary || entry.issue || entry.description || "unknown"
                  });
                }
              }
            } catch (e) {}
          }
        } catch (e) {}
      }
    }
  } catch (e) { return null; }

  if (recentLessons.length === 0) return null;

  // Check if docs/rca/ already has a recent RCA (last 2 hours)
  var rcaDir = path.join(PROJECT_DIR, "docs", "rca");
  try {
    if (fs.existsSync(rcaDir)) {
      var rcaFiles = fs.readdirSync(rcaDir);
      var today = new Date().toISOString().slice(0, 10);
      for (var r = 0; r < rcaFiles.length; r++) {
        if (rcaFiles[r].indexOf(today) === 0) {
          // Already wrote an RCA today — don't nag
          try { fs.writeFileSync(FLAG, today); } catch (e) {}
          log({ action: "skip", reason: "rca-exists-today" });
          return null;
        }
      }
    }
  } catch (e) {}

  // Write debounce flag
  try { fs.writeFileSync(FLAG, new Date().toISOString()); } catch (e) {}

  // Log the reminder
  log({
    action: "rca-reminder",
    lessonCount: recentLessons.length,
    categories: recentLessons.map(function(l) { return l.category + "/" + l.subcategory; })
  });

  // Emit reminder
  var incidents = recentLessons.slice(0, 3).map(function(l) {
    return "  - " + l.category + "/" + l.subcategory + ": " + String(l.summary).substring(0, 80);
  }).join("\n");

  process.stderr.write(
    "[T822] Self-healing detected " + recentLessons.length + " recent issue(s).\n" +
    "Write an RCA to docs/rca/" + new Date().toISOString().slice(0, 10) + "-{incident}.md\n" +
    "Recent findings:\n" + incidents + "\n" +
    "RCA template: Incident, Timeline, Root Cause, Contributing Factors, Fix, Prevention\n"
  );
  return null; // Non-blocking — stderr only
};

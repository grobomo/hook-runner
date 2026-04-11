// WORKFLOW: shtd
// WHY: Self-analysis generates lessons from interrupts, but those lessons
// are only useful if Claude reads them at the start of each session.
// This module reads self-analysis-lessons.jsonl and injects recent
// lessons as session context so Claude doesn't repeat past mistakes.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var CLAUDE_DIR = path.join(os.homedir(), ".claude");
var LESSONS_FILE = path.join(CLAUDE_DIR, "hooks", "self-analysis-lessons.jsonl");
var ERROR_LOG = path.join(CLAUDE_DIR, "self-analysis-errors.log");
var ANALYSIS_LOG = path.join(CLAUDE_DIR, "self-analysis.log");
var MAX_LESSONS = 20; // inject the 20 most recent (T352: increased from 10)
var MAX_LINES = 200; // rotate when file exceeds this (T351)
var ARCHIVE_FILE = path.join(CLAUDE_DIR, "hooks", "self-analysis-lessons-archive.jsonl");

function checkBgErrors() {
  // Surface background script errors that the user can't see
  var msgs = [];
  var logFiles = [ERROR_LOG, ANALYSIS_LOG];
  for (var i = 0; i < logFiles.length; i++) {
    var logFile = logFiles[i];
    try {
      if (!fs.existsSync(logFile)) continue;
      var stat = fs.statSync(logFile);
      // Only report if modified in last 24 hours
      if (Date.now() - stat.mtimeMs > 86400000) continue;
      var lines = fs.readFileSync(logFile, "utf-8").trim().split("\n");
      var errors = lines.filter(function(l) {
        return /error|fail|stderr/i.test(l);
      }).slice(-3);
      if (errors.length > 0) {
        msgs.push("Background script issues in " + path.basename(logFile) + ":\n" +
          errors.join("\n"));
      }
    } catch(e) {}
  }
  return msgs.length > 0 ? msgs.join("\n\n") : "";
}

module.exports = function(input) {
  var parts = [];
  try {
    // T379: Inject self-reflection system description so Claude understands
    // how the feedback loop works and can participate in it.
    parts.push(
      "SELF-REFLECTION SYSTEM: You have a self-reflection system that runs at every Stop event.\n" +
      "How it works: (1) self-reflection.js analyzes your session — gate decisions, edits, user corrections.\n" +
      "(2) Lessons are extracted and stored in self-analysis-lessons.jsonl.\n" +
      "(3) This module (load-lessons) injects those lessons at SessionStart so you learn from past sessions.\n" +
      "(4) reflection-score.js tracks your score (clean reflections +points, corrections -points).\n" +
      "YOUR ROLE: When you learn something this session (a mistake, a better pattern, a user correction),\n" +
      "write it to ~/.claude/hooks/self-analysis-lessons.jsonl as a JSONL line: {\"lesson\": \"...\", \"ts\": \"ISO\", \"session\": \"id\"}.\n" +
      "Future sessions will see it. Do NOT reinvent the system — it already exists and runs automatically."
    );

    // Check for background script errors
    var errors = checkBgErrors();
    if (errors) {
      parts.push("BACKGROUND SCRIPT ERRORS (auto-detected):\n" + errors +
        "\nInvestigate and fix these before they recur.");
    }

    // T351: Rotate lessons file if it exceeds MAX_LINES
    try {
      if (fs.existsSync(LESSONS_FILE)) {
        var allLines = fs.readFileSync(LESSONS_FILE, "utf-8").trim().split("\n");
        if (allLines.length > MAX_LINES) {
          var archive = allLines.slice(0, allLines.length - 100);
          var keep = allLines.slice(-100);
          // Append old lines to archive
          fs.appendFileSync(ARCHIVE_FILE, archive.join("\n") + "\n");
          // Overwrite lessons with recent 100
          fs.writeFileSync(LESSONS_FILE, keep.join("\n") + "\n");
        }
      }
    } catch(e) {}

    // Load lessons
    if (fs.existsSync(LESSONS_FILE)) {
      var content = fs.readFileSync(LESSONS_FILE, "utf-8").trim();
      if (content) {
        var lines = content.split("\n").filter(function(l) { return l.trim(); });
        var recent = lines.slice(-MAX_LESSONS);
        var lessons = recent.map(function(line) {
          try {
            var obj = JSON.parse(line);
            return obj.lesson || "";
          } catch(e) {
            return "";
          }
        }).filter(function(l) { return l; });

        if (lessons.length > 0) {
          parts.push("SELF-ANALYSIS LESSONS (from past interrupt reflections):\n" +
            lessons.join("\n") +
            "\nApply these lessons. If you catch yourself repeating a pattern, stop and correct.");
        }
      }
    }
  } catch(e) {}

  return parts.length > 0 ? { text: parts.join("\n\n") } : null;
};

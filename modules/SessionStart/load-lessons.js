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
var MAX_LESSONS = 10; // inject the 10 most recent

function checkBgErrors() {
  // Surface background script errors that the user can't see
  var msgs = [];
  [ERROR_LOG, ANALYSIS_LOG].forEach(function(logFile) {
    try {
      if (!fs.existsSync(logFile)) return;
      var stat = fs.statSync(logFile);
      // Only report if modified in last 24 hours
      if (Date.now() - stat.mtimeMs > 86400000) return;
      var lines = fs.readFileSync(logFile, "utf-8").trim().split("\n");
      var errors = lines.filter(function(l) {
        return /error|fail|stderr/i.test(l);
      }).slice(-3);
      if (errors.length > 0) {
        msgs.push("Background script issues in " + path.basename(logFile) + ":\n" +
          errors.join("\n"));
      }
    } catch(e) {}
  });
  return msgs.length > 0 ? msgs.join("\n\n") : "";
}

module.exports = function(input) {
  var parts = [];
  try {
    // Check for background script errors
    var errors = checkBgErrors();
    if (errors) {
      parts.push("BACKGROUND SCRIPT ERRORS (auto-detected):\n" + errors +
        "\nInvestigate and fix these before they recur.");
    }

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

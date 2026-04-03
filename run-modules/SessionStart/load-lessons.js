// WHY: Self-analysis generates lessons from interrupts, but those lessons
// are only useful if Claude reads them at the start of each session.
// This module reads self-analysis-lessons.jsonl and injects recent
// lessons as session context so Claude doesn't repeat past mistakes.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var LESSONS_FILE = path.join(os.homedir(), ".claude", "hooks", "self-analysis-lessons.jsonl");
var MAX_LESSONS = 10; // inject the 10 most recent

module.exports = function(input) {
  try {
    if (!fs.existsSync(LESSONS_FILE)) return null;
    var content = fs.readFileSync(LESSONS_FILE, "utf-8").trim();
    if (!content) return null;

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

    if (lessons.length === 0) return null;

    return "SELF-ANALYSIS LESSONS (from past interrupt reflections):\n" +
      lessons.join("\n") +
      "\nApply these lessons. If you catch yourself repeating a pattern, stop and correct.";
  } catch(e) {
    return null;
  }
};

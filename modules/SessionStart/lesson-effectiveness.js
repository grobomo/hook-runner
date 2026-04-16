// WORKFLOW: shtd, gsd
// WHY: Self-analysis lessons were captured (T381) but never checked for repetition.
// If the same lesson appears 3+ times, it means Claude keeps making the same mistake
// and the lesson alone isn't enough — a gate module should enforce it instead.
// This module scans lessons at session start and warns about repeated patterns.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var HOOKS_DIR = path.join(os.homedir(), ".claude", "hooks");
var LESSONS_PATH = path.join(HOOKS_DIR, "self-analysis-lessons.jsonl");
var ESCALATION_PATH = path.join(HOOKS_DIR, "lesson-escalations.jsonl");
var REPEAT_THRESHOLD = 3;

// Simple similarity: extract key phrases (lowercase, strip dates/timestamps/paths)
function normalize(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/\d{4}-\d{2}-\d{2}/g, "") // strip dates
    .replace(/[A-Z]:\\[^\s]+/g, "")     // strip Windows paths
    .replace(/\/[^\s]+/g, "")           // strip Unix paths
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200); // first 200 chars for comparison
}

// Extract action keywords from a lesson
function extractKeywords(text) {
  if (!text) return [];
  var words = normalize(text).split(" ");
  // Filter to meaningful words (>4 chars, not stopwords)
  var stops = ["when", "that", "this", "with", "from", "have", "will", "been", "should", "could", "would", "about", "their", "there", "which", "where", "these", "those", "other"];
  return words.filter(function(w) {
    return w.length > 4 && stops.indexOf(w) === -1;
  });
}

// Check if two lessons are about the same pattern (>60% keyword overlap)
function isSimilar(a, b) {
  var ka = extractKeywords(a);
  var kb = extractKeywords(b);
  if (ka.length === 0 || kb.length === 0) return false;
  var overlap = 0;
  for (var i = 0; i < ka.length; i++) {
    if (kb.indexOf(ka[i]) >= 0) overlap++;
  }
  var ratio = overlap / Math.min(ka.length, kb.length);
  return ratio > 0.6;
}

module.exports = function(input) {
  // Allow test injection
  var lessonsPath = (input && input._test_lessons_path) || LESSONS_PATH;
  var escalationPath = (input && input._test_escalation_path) || ESCALATION_PATH;

  if (!fs.existsSync(lessonsPath)) return null;

  var lessons;
  try {
    var raw = fs.readFileSync(lessonsPath, "utf-8").trim();
    if (!raw) return null;
    lessons = raw.split("\n").map(function(line) {
      try { return JSON.parse(line); } catch(e) { return null; }
    }).filter(Boolean);
  } catch(e) { return null; }

  if (lessons.length < REPEAT_THRESHOLD) return null;

  // Group similar lessons
  var clusters = [];
  for (var i = 0; i < lessons.length; i++) {
    var found = false;
    for (var j = 0; j < clusters.length; j++) {
      if (isSimilar(lessons[i].lesson, clusters[j][0].lesson)) {
        clusters[j].push(lessons[i]);
        found = true;
        break;
      }
    }
    if (!found) {
      clusters.push([lessons[i]]);
    }
  }

  // Find clusters that exceed threshold
  var repeated = clusters.filter(function(c) { return c.length >= REPEAT_THRESHOLD; });
  if (repeated.length === 0) return null;

  // Log escalations
  var escalations = [];
  for (var k = 0; k < repeated.length; k++) {
    var cluster = repeated[k];
    var escalation = {
      ts: new Date().toISOString(),
      count: cluster.length,
      firstSeen: cluster[0].ts,
      lastSeen: cluster[cluster.length - 1].ts,
      sample: (cluster[0].lesson || "").slice(0, 300),
      projects: cluster.map(function(l) { return l.project; }).filter(function(v, i, a) { return a.indexOf(v) === i; })
    };
    escalations.push(escalation);
  }

  // Write escalations (append)
  try {
    var lines = escalations.map(function(e) { return JSON.stringify(e); }).join("\n") + "\n";
    fs.appendFileSync(escalationPath, lines);
  } catch(e) {
    // best effort
  }

  // Warn via stderr
  var msg = "LESSON EFFECTIVENESS: " + repeated.length + " lesson pattern(s) repeated " + REPEAT_THRESHOLD + "+ times:\n";
  for (var m = 0; m < repeated.length; m++) {
    msg += "  - " + repeated[m].length + "x: " + (repeated[m][0].lesson || "").slice(0, 100) + "...\n";
  }
  msg += "These lessons aren't being enforced. Consider creating gate modules.\n";
  process.stderr.write(msg);

  return null; // non-blocking — informational at session start
};

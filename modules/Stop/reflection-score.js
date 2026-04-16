// WORKFLOW: shtd, gsd
// WHY: You can't improve what you can't measure. Every session starts blank —
// no memory of past performance. This score is the memory that survives context
// resets. It measures how well you protect the user's time: high score = autonomous
// and reliable, low score = creating cleanup work. Every session either earns
// trust or erodes it. The score makes that visible.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var HOOKS_DIR = path.join(os.homedir(), ".claude", "hooks");
var SCORE_PATH = path.join(HOOKS_DIR, "reflection-score.json");
var LOG_PATH = path.join(HOOKS_DIR, "hook-log.jsonl");
var REFLECTION_PATH = path.join(HOOKS_DIR, "self-reflection.jsonl");

// --- Scoring constants ---
// These encode what we value: consistency, self-correction, follow-through.
var POINTS = {
  CLEAN_REFLECTION: 10,       // doing things right
  ISSUE_FOUND_FIXED: 5,       // self-correction is valuable
  TODO_GENERATED: 2,           // noticing improvements is good
  TODO_COMPLETED: 5,           // following through matters most
  STREAK_BONUS: 2,             // per consecutive clean reflection
  DISMISSED_IMPROVEMENT: -3,   // laziness penalty
  WORKFLOW_VIOLATION: -10,     // real failure
  FALSE_POSITIVE_BLOCK: -2,    // gates blocking legitimate work
  // Intervention tracking — the ultimate metric of autonomy
  AUTONOMOUS_STRETCH: 3,       // per 10 tool calls with zero user prompts
  USER_CORRECTION: -5,         // "no", "stop", "wrong", "don't" = I messed up
  USER_INTERRUPT: -2,          // user interrupted mid-response
  FRUSTRATION_DETECTED: -15,   // frustration-detector fired — user is repeating themselves
  RAPID_INTERRUPT_CLUSTER: -20 // 3+ interrupts in 2 min — fundamental approach failure
};

// Levels: cumulative score thresholds
var LEVELS = [
  { min: 0, name: "Novice", desc: "Building trust. Reflection runs every 3 min." },
  { min: 50, name: "Apprentice", desc: "Showing consistency. Reflection every 5 min." },
  { min: 150, name: "Journeyman", desc: "Reliable. Reflection every 10 min." },
  { min: 300, name: "Expert", desc: "Trusted. Reflection every 15 min." },
  { min: 500, name: "Master", desc: "Autonomous. Reflection every 20 min." }
];

// Reflection frequency tied to level (milliseconds)
var REFLECTION_INTERVALS = {
  "Novice": 3 * 60 * 1000,
  "Apprentice": 5 * 60 * 1000,
  "Journeyman": 10 * 60 * 1000,
  "Expert": 15 * 60 * 1000,
  "Master": 20 * 60 * 1000
};

function readScore() {
  try {
    return JSON.parse(fs.readFileSync(SCORE_PATH, "utf-8"));
  } catch (e) {
    return {
      why: "This score measures how well you protect the user's time. " +
        "High score = autonomous and reliable. Low score = creating work " +
        "for the user to clean up. Every session either earns trust or erodes it.",
      total: 0,
      level: "Novice",
      streak: 0,
      bestStreak: 0,
      sessionsScored: 0,
      history: [],  // last 20 entries: { ts, delta, reason, total }
      todosGenerated: 0,
      todosCompleted: 0,
      violations: 0,
      dismissals: 0,
      reflectionIntervalMs: REFLECTION_INTERVALS["Novice"]
    };
  }
}

function writeScore(score) {
  try {
    fs.writeFileSync(SCORE_PATH, JSON.stringify(score, null, 2));
  } catch (e) {}
}

function getLevel(total) {
  var level = LEVELS[0];
  for (var i = 0; i < LEVELS.length; i++) {
    if (total >= LEVELS[i].min) level = LEVELS[i];
  }
  return level;
}

// Analyze user intervention patterns from hook-log
// Returns { autonomousStretches, corrections, interrupts }
function analyzeInterventions(lastScoredTs) {
  var result = { autonomousStretches: 0, corrections: 0, interrupts: 0 };
  try {
    var content = fs.readFileSync(LOG_PATH, "utf-8").trim();
    if (!content) return result;
    var lines = content.split("\n");

    // Only analyze entries since last scoring
    var toolCalls = 0;
    var userPrompts = 0;
    var correctionPatterns = /\b(no|stop|wrong|don't|dont|do not|fix|undo|revert|cancel)\b/i;

    for (var i = 0; i < lines.length; i++) {
      try {
        var entry = JSON.parse(lines[i]);
        // Skip entries before last scoring
        if (lastScoredTs && entry.ts < lastScoredTs) continue;

        if (entry.event === "PreToolUse" || entry.event === "PostToolUse") {
          toolCalls++;
        }
        if (entry.event === "UserPromptSubmit") {
          userPrompts++;
          // Check for correction patterns in the command/reason
          var text = (entry.cmd || "") + " " + (entry.reason || "");
          if (correctionPatterns.test(text)) {
            result.corrections++;
          }
          // Check for interrupts (prompt-logger marks these)
          if (entry.reason && entry.reason.indexOf("interrupt") >= 0) {
            result.interrupts++;
          }
        }
      } catch (e) { continue; }
    }

    // Count autonomous stretches (every 10 tool calls without a user prompt)
    // Simple approximation: (toolCalls - userPrompts*10) / 10
    if (toolCalls > 0 && userPrompts === 0) {
      result.autonomousStretches = Math.floor(toolCalls / 10);
    } else if (toolCalls > userPrompts * 10) {
      result.autonomousStretches = Math.floor((toolCalls - userPrompts * 10) / 10);
    }
  } catch (e) {}
  return result;
}

// Count completed TODOs since last scoring (check TODO.md for [x] items)
function countCompletedTodos(lastScoredTs) {
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (!projectDir) return 0;
  var todoPath = path.join(projectDir, "TODO.md");
  try {
    var content = fs.readFileSync(todoPath, "utf-8");
    // Count [x] items in "Self-Reflection TODOs" sections
    var inSection = false;
    var completed = 0;
    var lines = content.split("\n");
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf("Self-Reflection TODOs") >= 0) inSection = true;
      else if (lines[i].indexOf("## ") === 0 && inSection) inSection = false;
      if (inSection && /^- \[x\] T\d+/.test(lines[i])) completed++;
    }
    return completed;
  } catch (e) { return 0; }
}

// Read latest reflection result
function getLatestReflection() {
  try {
    var content = fs.readFileSync(REFLECTION_PATH, "utf-8").trim();
    if (!content) return null;
    var lines = content.split("\n");
    return JSON.parse(lines[lines.length - 1]);
  } catch (e) { return null; }
}

// Main scoring function — called from self-reflection module after each analysis
function calculateDelta(reflection, score) {
  var delta = 0;
  var reasons = [];

  if (!reflection) return { delta: 0, reasons: ["no reflection data"] };

  var verdict = reflection.verdict || "unknown";
  var issues = reflection.issues || [];
  var todos = reflection.todos || [];

  // Clean verdict bonus
  if (verdict === "clean") {
    delta += POINTS.CLEAN_REFLECTION;
    reasons.push("+" + POINTS.CLEAN_REFLECTION + " clean reflection");

    // Streak bonus
    score.streak++;
    if (score.streak > 1) {
      var streakPts = POINTS.STREAK_BONUS * (score.streak - 1);
      delta += streakPts;
      reasons.push("+" + streakPts + " streak (" + score.streak + " consecutive clean)");
    }
    if (score.streak > score.bestStreak) score.bestStreak = score.streak;
  } else {
    score.streak = 0; // reset on any non-clean
  }

  // Score individual issues
  for (var i = 0; i < issues.length; i++) {
    var issue = issues[i];
    var sev = issue.severity || "low";
    var desc = (issue.description || "").substring(0, 60);

    if (sev === "high" && /workflow.violation/i.test(desc)) {
      delta += POINTS.WORKFLOW_VIOLATION;
      score.violations++;
      reasons.push(POINTS.WORKFLOW_VIOLATION + " workflow violation: " + desc);
    } else if (/dismiss/i.test(desc) || /good enough/i.test(desc) || /rationali/i.test(desc)) {
      delta += POINTS.DISMISSED_IMPROVEMENT;
      score.dismissals++;
      reasons.push(POINTS.DISMISSED_IMPROVEMENT + " dismissed improvement: " + desc);
    } else if (sev === "high") {
      delta += POINTS.WORKFLOW_VIOLATION;
      reasons.push(POINTS.WORKFLOW_VIOLATION + " high-severity: " + desc);
    } else if (sev === "medium") {
      delta += Math.floor(POINTS.DISMISSED_IMPROVEMENT / 2);
      reasons.push(Math.floor(POINTS.DISMISSED_IMPROVEMENT / 2) + " medium issue: " + desc);
    }
  }

  // TODOs generated
  if (todos.length > 0) {
    var todoPts = POINTS.TODO_GENERATED * todos.length;
    delta += todoPts;
    score.todosGenerated += todos.length;
    reasons.push("+" + todoPts + " generated " + todos.length + " TODO(s)");
  }

  // TODOs completed since last scoring
  var completed = countCompletedTodos();
  if (completed > score.todosCompleted) {
    var newlyCompleted = completed - score.todosCompleted;
    var completePts = POINTS.TODO_COMPLETED * newlyCompleted;
    delta += completePts;
    score.todosCompleted = completed;
    reasons.push("+" + completePts + " completed " + newlyCompleted + " reflection TODO(s)");
  }

  // Intervention analysis — the ultimate autonomy metric
  var lastTs = score.history.length > 0
    ? score.history[score.history.length - 1].ts : null;
  var interventions = analyzeInterventions(lastTs);

  if (interventions.autonomousStretches > 0) {
    var autoPts = POINTS.AUTONOMOUS_STRETCH * interventions.autonomousStretches;
    delta += autoPts;
    reasons.push("+" + autoPts + " autonomous (" + interventions.autonomousStretches + " stretches of 10+ tool calls without user input)");
  }
  if (interventions.corrections > 0) {
    var corrPts = POINTS.USER_CORRECTION * interventions.corrections;
    delta += corrPts;
    reasons.push(corrPts + " user corrections (" + interventions.corrections + "x)");
  }
  if (interventions.interrupts > 0) {
    var intPts = POINTS.USER_INTERRUPT * interventions.interrupts;
    delta += intPts;
    reasons.push(intPts + " user interrupts (" + interventions.interrupts + "x)");
  }

  // Frustration detection — check frustration-log.jsonl for recent events
  var frustrationLogPath = path.join(HOOKS_DIR, "frustration-log.jsonl");
  try {
    if (fs.existsSync(frustrationLogPath)) {
      var fContent = fs.readFileSync(frustrationLogPath, "utf-8").trim();
      if (fContent) {
        var fLines = fContent.split("\n");
        var tenMinAgo = Date.now() - 600000;
        var frustrationCount = 0;
        var hasRapidCluster = false;
        for (var fIdx = Math.max(0, fLines.length - 20); fIdx < fLines.length; fIdx++) {
          try {
            var fEntry = JSON.parse(fLines[fIdx]);
            if (lastTs && fEntry.ts < lastTs) continue; // skip already-scored
            if (new Date(fEntry.ts).getTime() > tenMinAgo) {
              frustrationCount++;
              if (fEntry.interrupts >= 3) hasRapidCluster = true;
            }
          } catch (fe) {}
        }
        if (frustrationCount > 0) {
          var frusPts = POINTS.FRUSTRATION_DETECTED * frustrationCount;
          delta += frusPts;
          reasons.push(frusPts + " frustration events (" + frustrationCount + "x — user had to repeat themselves)");
        }
        if (hasRapidCluster) {
          delta += POINTS.RAPID_INTERRUPT_CLUSTER;
          reasons.push(POINTS.RAPID_INTERRUPT_CLUSTER + " rapid interrupt cluster (3+ in 2min — fundamental approach failure)");
        }
      }
    }
  } catch (e) {}

  return { delta: delta, reasons: reasons };
}

// Update score and return summary
function updateScore(reflection) {
  var score = readScore();
  var result = calculateDelta(reflection, score);

  score.total += result.delta;
  if (score.total < 0) score.total = 0; // floor at 0
  score.sessionsScored++;

  var level = getLevel(score.total);
  var prevLevel = score.level;
  score.level = level.name;
  score.reflectionIntervalMs = REFLECTION_INTERVALS[level.name] || REFLECTION_INTERVALS["Novice"];

  // Track history (last 20)
  score.history.push({
    ts: new Date().toISOString(),
    delta: result.delta,
    reasons: result.reasons,
    total: score.total
  });
  if (score.history.length > 20) {
    score.history = score.history.slice(score.history.length - 20);
  }

  writeScore(score);

  var levelChange = (prevLevel !== level.name)
    ? " LEVEL " + (result.delta >= 0 ? "UP" : "DOWN") + ": " + prevLevel + " → " + level.name
    : "";

  return {
    delta: result.delta,
    total: score.total,
    level: level.name,
    levelDesc: level.desc,
    streak: score.streak,
    bestStreak: score.bestStreak,
    levelChange: levelChange,
    reasons: result.reasons,
    reflectionIntervalMs: score.reflectionIntervalMs
  };
}

// Format score for display (SessionStart injection or Stop message)
function formatSummary() {
  var score = readScore();
  var level = getLevel(score.total);
  var summary = "REFLECTION SCORE: " + score.total + " (" + level.name + ")\n";
  summary += "WHY: " + score.why + "\n";
  summary += "Streak: " + score.streak + " clean (best: " + score.bestStreak + ") | ";
  summary += "Sessions: " + score.sessionsScored + " | ";
  summary += "TODOs: " + score.todosGenerated + " generated, " + score.todosCompleted + " completed\n";
  summary += "Next reflection in: " + Math.round(score.reflectionIntervalMs / 60000) + " min\n";

  if (score.history.length > 0) {
    var last = score.history[score.history.length - 1];
    summary += "Last: " + (last.delta >= 0 ? "+" : "") + last.delta + " (" + last.reasons.join("; ") + ")\n";
  }

  return summary;
}

// Export as function (module contract) with utility methods as properties.
// This is a shared library — the function itself is a no-op (returns null).
// Other modules require() it for updateScore, formatSummary, etc.
function reflectionScore() { return null; }
reflectionScore.POINTS = POINTS;
reflectionScore.LEVELS = LEVELS;
reflectionScore.REFLECTION_INTERVALS = REFLECTION_INTERVALS;
reflectionScore.readScore = readScore;
reflectionScore.writeScore = writeScore;
reflectionScore.getLevel = getLevel;
reflectionScore.updateScore = updateScore;
reflectionScore.formatSummary = formatSummary;
reflectionScore.SCORE_PATH = SCORE_PATH;

module.exports = reflectionScore;

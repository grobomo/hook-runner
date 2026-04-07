// WORKFLOW: shtd
// WHY: Self-reflection catches issues in-session but misses cross-session patterns.
// User has given the same instruction 3+ times ("no rules, only hooks") without it
// sticking. This module triggers brain-level analysis at session end to review
// historical prompts, detect repeated instructions, and fine-tune self-reflection
// triggers so they catch what was missed next time.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");

var HOOKS_DIR = path.join(os.homedir(), ".claude", "hooks");
var PROMPT_LOG = path.join(HOOKS_DIR, "prompt-log.jsonl");
var REFLECTION_LOG = path.join(HOOKS_DIR, "self-reflection.jsonl");
var SESSIONS_LOG = path.join(HOOKS_DIR, "reflection-sessions.jsonl");
var BRAIN_LOG = path.join(HOOKS_DIR, "brain-analysis.jsonl");
var BRAIN_TIMEOUT = 90000; // 90s — deep analysis needs time

// Rate limit: run at most once per 4 hours (brain analysis is expensive)
var RATE_LIMIT_PATH = path.join(HOOKS_DIR, ".brain-analysis-last-run");
var RATE_LIMIT_MS = 4 * 60 * 60 * 1000; // 4 hours

function shouldRun() {
  try {
    if (!fs.existsSync(RATE_LIMIT_PATH)) return true;
    var lastRun = parseInt(fs.readFileSync(RATE_LIMIT_PATH, "utf-8").trim(), 10);
    return (Date.now() - lastRun) > RATE_LIMIT_MS;
  } catch (e) { return true; }
}

function markRun() {
  try { fs.writeFileSync(RATE_LIMIT_PATH, String(Date.now())); } catch (e) {}
}

// Read last N lines from a JSONL file
function readLastLines(filePath, count) {
  try {
    if (!fs.existsSync(filePath)) return [];
    var content = fs.readFileSync(filePath, "utf-8").trim();
    if (!content) return [];
    var lines = content.split("\n");
    var start = Math.max(0, lines.length - count);
    var results = [];
    for (var i = start; i < lines.length; i++) {
      try { results.push(JSON.parse(lines[i])); } catch (e) {}
    }
    return results;
  } catch (e) { return []; }
}

// Build the brain analysis prompt
function buildBrainPrompt() {
  // Read historical data
  var prompts = readLastLines(PROMPT_LOG, 200);       // last 200 user prompts
  var reflections = readLastLines(REFLECTION_LOG, 30); // last 30 reflections
  var sessions = readLastLines(SESSIONS_LOG, 20);      // last 20 session summaries

  if (prompts.length < 5) return ""; // not enough data

  var prompt = "You are the brain analysis module for a Claude Code hook-runner system.\n";
  prompt += "You are performing a DEEP REVIEW of historical session data to find patterns\n";
  prompt += "that the in-session self-reflection module missed.\n\n";

  prompt += "GOAL: Identify repeated user instructions, recurring issues, and blind spots\n";
  prompt += "in the self-reflection system. Output concrete fixes.\n\n";

  // User prompts section — focus on instruction/correction patterns
  prompt += "=== USER PROMPTS (last " + prompts.length + ") ===\n";
  var instructionCount = 0;
  for (var i = 0; i < prompts.length; i++) {
    var p = prompts[i];
    var text = (p.preview || "").toLowerCase();
    // Flag correction/instruction prompts
    var isInstruction = /\bnever\b|\balways\b|\bdon'?t\b|\bstop\b|\bblock\b|\bneed a hook\b|\bonly hook|\bno rules\b/.test(text);
    if (isInstruction) {
      prompt += "[INSTRUCTION] " + (p.ts || "?") + " " + (p.project || "?") + ": " + p.preview + "\n";
      instructionCount++;
    }
  }
  if (instructionCount === 0) {
    prompt += "(No instruction-pattern prompts found in recent history)\n";
  }

  // Correction prompts — "no", "wrong", "stop", short terse replies
  prompt += "\n=== CORRECTION SIGNALS ===\n";
  var corrections = 0;
  for (var j = 0; j < prompts.length; j++) {
    var cp2 = prompts[j];
    var t = (cp2.preview || "").trim();
    if (t.length < 30 && /^(no|wrong|stop|don'?t|not that|undo|revert|cancel)/i.test(t)) {
      prompt += "[CORRECTION] " + (cp2.ts || "?") + ": " + t + "\n";
      corrections++;
    }
  }
  if (corrections === 0) prompt += "(No correction signals found)\n";

  // Self-reflection verdicts
  prompt += "\n=== SELF-REFLECTION HISTORY (last " + reflections.length + ") ===\n";
  for (var k = 0; k < reflections.length; k++) {
    var r = reflections[k];
    prompt += "[" + (r.ts || "?") + "] " + (r.verdict || "?");
    if (r.issues && r.issues.length > 0) {
      prompt += " — issues: ";
      for (var m = 0; m < r.issues.length; m++) {
        prompt += r.issues[m].severity + ": " + (r.issues[m].description || "").substring(0, 60) + "; ";
      }
    }
    prompt += "\n";
  }

  // Session summaries
  prompt += "\n=== SESSION SUMMARIES (last " + sessions.length + ") ===\n";
  for (var s = 0; s < sessions.length; s++) {
    var sess = sessions[s];
    prompt += "[" + (sess.ts || "?") + "] " + (sess.project || "?") + "/" + (sess.branch || "?") +
      " — " + (sess.verdict || "?") + ", " + (sess.files_edited || 0) + " files, " +
      (sess.issues_found || 0) + " issues, score " + (sess.score_total || "?") + "\n";
  }

  prompt += "\n=== ANALYSIS TASKS ===\n";
  prompt += "1. REPEATED INSTRUCTIONS: Find user instructions given 2+ times across sessions.\n";
  prompt += "   For each, determine if it's already enforced by a hook module. If not, flag it.\n";
  prompt += "2. BLIND SPOTS: What patterns is self-reflection missing? What should it detect?\n";
  prompt += "3. CORRECTION FREQUENCY: Is the user correcting Claude more or less over time?\n";
  prompt += "4. PROMPT PATTERNS: Any recurring frustration signals in user prompts?\n";
  prompt += "5. TRIGGER IMPROVEMENTS: Suggest specific additions to self-reflection's analysis\n";
  prompt += "   prompt that would catch what was missed.\n\n";

  prompt += "RESPOND IN JSON ONLY:\n";
  prompt += '{\n';
  prompt += '  "repeated_instructions": [{"instruction": "...", "count": N, "enforced": true/false, "fix": "..."}],\n';
  prompt += '  "blind_spots": [{"pattern": "...", "how_to_detect": "...", "severity": "high|medium|low"}],\n';
  prompt += '  "correction_trend": "improving|stable|worsening",\n';
  prompt += '  "trigger_improvements": ["add X to self-reflection prompt", ...],\n';
  prompt += '  "todos": [{"id": "T???", "description": "..."}]\n';
  prompt += '}\n';

  return prompt;
}

// Parse JSON response from claude -p
function parseResponse(raw) {
  if (!raw) return null;
  // Try extracting JSON from markdown code blocks
  var jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1].trim()); } catch (e) {}
  }
  // Try direct parse
  try {
    return JSON.parse(raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
  } catch (e) { return null; }
}

module.exports = async function(input) {
  // Skip expensive claude -p call during test validation
  if (process.env.HOOK_RUNNER_TEST) return null;
  if (!shouldRun()) return null;

  var prompt = buildBrainPrompt();
  if (!prompt) return null;

  markRun(); // mark before running to prevent concurrent runs

  try {
    var result = cp.execSync("claude -p --output-format json", {
      input: prompt,
      encoding: "utf-8",
      timeout: BRAIN_TIMEOUT,
      stdio: ["pipe", "pipe", "pipe"]
    });

    var raw = result.trim();
    var parsed = parseResponse(raw);

    // Log the analysis
    try {
      var logEntry = {
        ts: new Date().toISOString(),
        project: path.basename(process.env.CLAUDE_PROJECT_DIR || "unknown"),
        prompt_length: prompt.length,
        raw_length: raw.length,
        parsed: parsed
      };
      fs.appendFileSync(BRAIN_LOG, JSON.stringify(logEntry) + "\n");
    } catch (e) {}

    // If brain found unenforced repeated instructions, write TODOs
    if (parsed && parsed.todos && parsed.todos.length > 0) {
      var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
      var todoPath = path.join(projectDir, "TODO.md");
      if (projectDir && fs.existsSync(todoPath)) {
        try {
          var todoContent = fs.readFileSync(todoPath, "utf-8");
          var newTodos = "\n## Brain Analysis TODOs (auto-generated " + new Date().toISOString().split("T")[0] + ")\n";
          for (var i = 0; i < parsed.todos.length; i++) {
            var todo = parsed.todos[i];
            newTodos += "- [ ] " + (todo.id || "T???") + ": " + todo.description + "\n";
          }
          fs.appendFileSync(todoPath, newTodos);
        } catch (e) {}
      }
    }

    // If brain suggests trigger improvements, log them prominently
    if (parsed && parsed.trigger_improvements && parsed.trigger_improvements.length > 0) {
      try {
        var triggerEntry = {
          ts: new Date().toISOString(),
          type: "trigger-improvements",
          improvements: parsed.trigger_improvements
        };
        fs.appendFileSync(BRAIN_LOG, JSON.stringify(triggerEntry) + "\n");
      } catch (e) {}
    }

  } catch (e) {
    // Brain analysis failed — not critical, log and move on
    try {
      fs.appendFileSync(BRAIN_LOG, JSON.stringify({
        ts: new Date().toISOString(),
        error: e.message
      }) + "\n");
    } catch (e2) {}
  }

  return null;
};

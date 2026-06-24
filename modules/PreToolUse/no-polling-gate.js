// TOOLS: Bash
// WORKFLOW: starter, shtd
// WHY: Claude burned $10k/month polling GitHub comments, log tails, and deploy
// status in LLM tool calls. Every poll cycle costs tokens and returns nothing
// useful most of the time. Polling must use scripts or webhooks — never LLM
// tool calls. User corrected this 5+ times before this gate was created.
"use strict";

// Pattern 1: Loop-based polling — while/for + sleep + check command
var LOOP_POLL = /\b(while|for)\b[\s\S]{0,200}\bsleep\b[\s\S]{0,200}\b(curl|gh\b|az\b|aws\b|kubectl|systemctl|docker|podman|terraform)\b/;

// Pattern 2: GitHub comment checking (GET, not POST) — polling for replies
var GH_COMMENT_POLL = /\bgh\s+api\b[\s\S]{0,100}\/comments\b/;
var GH_COMMENT_POST = /--method\s+POST|-X\s+POST/;

// Pattern 3: Log tailing / following
var LOG_TAIL = [
  /\bjournalctl\b[\s\S]{0,60}(-f|--follow)\b/,
  /\btail\b[\s\S]{0,40}(-f|--follow|-F)\b/,
  /\bkubectl\s+logs\b[\s\S]{0,60}(-f|--follow)\b/,
  /\bdocker\s+logs\b[\s\S]{0,60}(-f|--follow)\b/,
  /\bstern\b[\s\S]{0,60}(-f|--follow)\b/
];

// Pattern 4: watch command (repeatedly runs a command)
var WATCH_CMD = /^\s*watch\s+/;

// Pattern 5: Polling loops using until
var UNTIL_POLL = /\buntil\b[\s\S]{0,200}\bsleep\b/;

var BLOCK_MSG =
  "NO-POLLING GATE: Do not poll from LLM tool calls — it wastes tokens.\n\n" +
  "ALTERNATIVES:\n" +
  "  1. WEBHOOKS: Set up a webhook (GitHub, cloud provider) to notify on change\n" +
  "  2. SCRIPT: Write a standalone polling script (bash/python) and run it once\n" +
  "  3. SINGLE CHECK: Run the check command ONCE, then move on to other work\n" +
  "  4. run_in_background: Use Bash run_in_background for long-running checks\n\n" +
  "Polling in LLM calls cost $10k/month and most cycles return nothing useful.";

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;
  var cmd = (input.tool_input || {}).command || "";
  if (!cmd) return null;

  // Pattern 1: Loop-based polling
  if (LOOP_POLL.test(cmd)) {
    return {
      decision: "block",
      reason: BLOCK_MSG + "\n\nDETECTED: Loop-based polling (while/for + sleep + check command)."
    };
  }

  // Pattern 5: until-based polling
  if (UNTIL_POLL.test(cmd)) {
    return {
      decision: "block",
      reason: BLOCK_MSG + "\n\nDETECTED: until-loop polling (until + sleep)."
    };
  }

  // Pattern 2: GitHub comment polling (GET only, not POST)
  if (GH_COMMENT_POLL.test(cmd) && !GH_COMMENT_POST.test(cmd)) {
    return {
      decision: "block",
      reason: "BLOCKED: Repeated polling of GitHub API endpoints (comments, logs, deploys)\nWHY: Polling GitHub comments and log tails in loops cost $10k/month in unnecessary API calls and compute.\nNEXT STEPS:\n1. Use gh api --jq to fetch once, then process the result instead of looping\n2. For monitoring replies or changes, set up a GitHub webhook or use event-driven patterns instead\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix no-polling-gate — {describe the issue}\""
    };
  }

  // Pattern 3: Log tailing / following
  for (var i = 0; i < LOG_TAIL.length; i++) {
    if (LOG_TAIL[i].test(cmd)) {
      return {
        decision: "block",
        reason: "BLOCKED: Log tailing/following operations that stream indefinitely (journalctl -f, tail -f, kubectl logs -f, polling GitHub/deploy APIs)\nWHY: Streaming logs consume unbounded tokens and context, causing runaway costs like the $10k/month GitHub polling incident\nNEXT STEPS:\n1. Use single snapshots instead: journalctl -n 50, tail -n 50, kubectl logs --tail=50\n2. For one-time status checks, query APIs directly without polling loops\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix no-polling-gate — {describe the issue}\""
      };
    }
  }

  // Pattern 4: watch command
  if (WATCH_CMD.test(cmd)) {
    return {
      decision: "block",
      reason: "BLOCKED: watch command (runs indefinitely)\nWHY: Polling loops caused $10k/month in unnecessary API costs by continuously querying GitHub comments and logs\nNEXT STEPS:\n1. Run the underlying command once instead of using watch\n2. For ongoing monitoring, use event-based alternatives or scheduled jobs with explicit intervals\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix no-polling-gate — {describe the issue}\""
    };
  }

  return null;
};

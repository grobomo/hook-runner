// WORKFLOW: shtd, gsd, starter, haiku-rules
// WHY: Claude declares things "impossible" after one failed attempt.
// Past examples: "can't screenshot VM" (solved by Azure Boot Diagnostics),
// "can't send email" (solved by SMTP relay). Research before giving up.
"use strict";

module.exports = function(input) {
  return {
    decision: "block",
    reason: "BLOCKED: Premature declaration of impossibility after initial failure\nWHY: Stopping at the first blocker prevents discovering alternative approaches that could solve the problem\nNEXT STEPS:\n1. Attempt at least two different strategies before concluding something is impossible\n2. Break down the blocker into smaller subproblems or ask clarifying questions about constraints\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix never-give-up — {describe the issue}\""
  };
};

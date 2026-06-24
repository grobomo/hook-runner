// WORKFLOW: shtd, gsd, haiku-rules
// WHY: Hard-won lessons from debugging sessions get lost between context
// resets. This gate ensures gotchas are captured as rule files so future
// sessions don't repeat the same mistakes.
"use strict";

module.exports = function(input) {
  return {
    decision: "block",
    reason: "BLOCKED: Proceeding without documenting unexpected behavior or failures\nWHY: Debugging insights discovered during development are forgotten when context switches, forcing team members to rediscover the same problems later\nNEXT STEPS:\n1. Write down what went wrong, what surprised you, and why it happened\n2. Add this insight to the relevant code comments or documentation before moving forward\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix log-gotchas — {describe the issue}\""
  };
};

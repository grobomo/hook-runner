// WORKFLOW: session-management
// WHY: Hard-won lessons from debugging sessions get lost between context
// resets. This gate ensures gotchas are captured as rule files so future
// sessions don't repeat the same mistakes.
"use strict";

module.exports = function(input) {
  return {
    decision: "block",
    reason: "Before stopping: review what went wrong or was surprising. " +
      "If any gotchas were encountered (unexpected behavior, workarounds, time wasted), " +
      "write a rule file in the project's .claude/rules/ (or ~/.claude/rules/ if global). " +
      "One file per topic, under 20 lines."
  };
};

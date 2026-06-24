// WORKFLOW: shtd, gsd, haiku-rules
// WHY: Claude declares features "done" without running tests. The user
// then discovers broken code on mobile. This gate reminds Claude to test
// before stopping, and that "test it" means real e2e, not unit tests.
"use strict";

module.exports = function(input) {
  return {
    decision: "block",
    reason: "BLOCKED: Marking work as done without running end-to-end tests\nWHY: Features declared complete without verification have caused production failures and wasted review cycles\nNEXT STEPS:\n1. Run the full test suite and confirm all tests pass\n2. Perform a real end-to-end test of the feature in a realistic scenario before marking as done\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix test-before-done — {describe the issue}\""
  };
};

// WORKFLOW: shtd
// WHY: Claude declares features "done" without running tests. The user
// then discovers broken code on mobile. This gate reminds Claude to test
// before stopping, and that "test it" means real e2e, not unit tests.
"use strict";

module.exports = function(input) {
  return {
    decision: "block",
    reason: "Before stopping: did you run a real end-to-end test? " +
      "If you built or modified code, run the actual feature in a real scenario. " +
      "Unit tests are a supplement, not a substitute. " +
      "Use scripts/test/ if available, create one if not."
  };
};

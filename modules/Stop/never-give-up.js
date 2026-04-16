// WORKFLOW: starter
// WHY: Claude declares things "impossible" after one failed attempt.
// Past examples: "can't screenshot VM" (solved by Azure Boot Diagnostics),
// "can't send email" (solved by SMTP relay). Research before giving up.
"use strict";

module.exports = function(input) {
  return {
    decision: "block",
    reason: "Before declaring something impossible or stopping due to a blocker: " +
      "1) WebSearch for alternatives, " +
      "2) try at least 3 different approaches, " +
      "3) check if there's an API/feature you didn't know about. " +
      "Only report a blocker after exhausting options — with what you tried and what you found."
  };
};

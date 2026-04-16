// WORKFLOW: shtd, gsd
// WHY: Claude kept adding `sleep` between Blueprint MCP calls thinking pages
// needed time to load. Each Claude prompt takes 3-10s to process — more than
// enough for pages to load. Sleep wastes time twice: once for the sleep, once
// for Claude processing the sleep result.
"use strict";

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;
  var cmd = (input.tool_input || {}).command || "";

  // Block sleep commands that appear to be between browser automation steps
  if (!/^\s*sleep\b/.test(cmd)) return null;

  // Check conversation context for recent Blueprint tool usage
  // Since we can't access conversation history, block all bare `sleep` commands
  // and let the user override if they really need one
  var seconds = cmd.match(/sleep\s+(\d+)/);
  if (!seconds) return null;
  var dur = parseInt(seconds[1], 10);

  // Only block sleeps > 1s (short sleeps may be intentional for other reasons)
  if (dur <= 1) return null;

  return {
    decision: "block",
    reason: "PERFORMANCE: Do not use sleep between actions.\n" +
      "Each Claude prompt takes 3-10s to process — pages will have loaded.\n" +
      "Just call the next action directly. Sleep wastes time twice.\n" +
      "If you truly need a delay, use sleep 1 (max 1 second)."
  };
};

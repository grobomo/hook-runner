// WHY: Claude autonomously sent messages to real people during testing.
// This gate blocks all outbound messaging (email, Teams, meetings) unless
// the target is explicitly authorized. Prevents accidental spam to colleagues.
// WORKFLOW: messaging-safety
"use strict";

var ALLOWED_CHAT_IDS = [
  "19:cf504fc638964747bff028e4ba785869@thread.v2", // hackathon team chat
];

var SEND_PATTERNS = [
  /teams_chat\.py\s+send/,
  /graph_post.*messages/,
  /graph_post.*sendMail/,
  /graph_post.*events/,       // calendar invites
  /schedule\.py\s+create/,    // meeting scheduler
  /smtp.*send/i,
];

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;
  var cmd = (input.tool_input || {}).command || "";

  for (var i = 0; i < SEND_PATTERNS.length; i++) {
    if (!SEND_PATTERNS[i].test(cmd)) continue;

    // Check if targeting an allowed chat
    var allowed = false;
    for (var j = 0; j < ALLOWED_CHAT_IDS.length; j++) {
      if (cmd.indexOf(ALLOWED_CHAT_IDS[j]) !== -1) { allowed = true; break; }
    }
    if (allowed) return null;

    return {
      decision: "block",
      reason: "MESSAGING GATE: This command sends a message to a real person/chat. " +
        "Only the hackathon team chat is pre-authorized. " +
        "For any other target, get explicit user permission first."
    };
  }
  return null;
};

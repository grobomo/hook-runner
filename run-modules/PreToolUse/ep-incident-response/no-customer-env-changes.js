// WORKFLOW: customer-data-guard
// WHY: Must not modify anything in the customer's cloud environment.
// Blocks AWS/Azure CLI commands targeting non-hackathon accounts,
// and any Blueprint automation against customer portals.
"use strict";

var HACKATHON_ACCOUNT = "752266476357";

module.exports = function(input) {
  var tool = input.tool_name;

  if (tool === "Bash") {
    var cmd = (input.tool_input || {}).command || "";

    // Block AWS CLI commands that don't use hackathon profile/account
    if (/\baws\s/.test(cmd)) {
      // Allow if explicitly using hackathon profile
      if (/--profile\s+hackathon/.test(cmd)) return null;
      // Allow if AWS_PROFILE=hackathon is set
      if (/AWS_PROFILE=hackathon/.test(cmd)) return null;
      // Allow common safe commands
      if (/aws\s+(configure|sts\s+get-caller-identity|--version)/.test(cmd)) return null;
      // Block anything else — could hit wrong account
      return {
        decision: "block",
        reason: "CUSTOMER ENV GATE: AWS command without explicit --profile hackathon.\n" +
          "POLICY: Only our hackathon account (" + HACKATHON_ACCOUNT + ") is allowed.\n" +
          "Never run AWS commands against customer accounts.\n" +
          "FIX: Add --profile hackathon to the command."
      };
    }

    // Block Azure CLI entirely (we don't use Azure for this project)
    if (/\baz\s/.test(cmd) && !/\baz\b.*--help/.test(cmd)) {
      return {
        decision: "block",
        reason: "CUSTOMER ENV GATE: Azure CLI is blocked for this project.\n" +
          "POLICY: EP incident response uses AWS (hackathon account) only.\n" +
          "Azure commands could accidentally target the customer's environment."
      };
    }
  }

  // Block Blueprint automation against customer portals
  if (tool === "Skill") {
    var skill = (input.tool_input || {}).skill || "";
    var args = (input.tool_input || {}).args || "";
    // v1-policy can modify customer policies via browser
    if (skill === "v1-policy" && /\b(update|set|enable|disable|create|delete|modify)\b/i.test(args)) {
      return {
        decision: "block",
        reason: "CUSTOMER ENV GATE: v1-policy with write operations is blocked.\n" +
          "POLICY: Read-only access to customer V1. No policy changes."
      };
    }
  }

  return null;
};

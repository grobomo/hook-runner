// WORKFLOW: customer-data-guard
// WHY: Customer incident data must NEVER leave the local laptop.
// Blocks any tool that could transmit EP investigation results externally:
// email, Teams, wiki, Slack, HTTP POST to external services, etc.
// Code (no customer data) can go to tmemu GitHub. Investigation results stay local.
"use strict";

// Skills that send data externally
var BLOCKED_SKILLS = [
  "email-checker",      // could email results
  "smtp-relay",         // direct SMTP
  "rone-chat",          // Teams chat
  "wiki-api",           // Confluence
  "weekly-update",      // posts to Teams
  "emu-marketplace",    // publishes externally
  "publish-project",    // could publish to public GitHub
];

// Bash patterns that send data externally
var BLOCKED_BASH_PATTERNS = [
  /\bcurl\b.*-X\s*(POST|PUT|PATCH)\b(?!.*api\.xdr\.trendmicro)(?!.*github)/i,  // POST to non-V1, non-GitHub
  /\bwget\b.*--post/i,
  /teams_chat\.py\s+send/,
  /graph_post.*sendMail/i,
  /smtp/i,
  /\bslack\b/i,
  /\bnc\b.*-[clp]/,          // netcat
  /\bscp\b|\bsftp\b|\brsync\b.*:/,  // file transfer
  /s3\s+(cp|sync|mv)\b.*s3:/i,       // S3 uploads (reading from S3 is ok)
];

// Files/dirs that contain customer data — block if they appear in git add/push/commit
var CUSTOMER_DATA_PATHS = [
  /\/reports\//,
  /\/results\//,
  /\/investigation\//,
  /\/findings\//,
  /\.csv$/,
  /\.xlsx$/,
  /rca[_-]report/i,
  /incident[_-]data/i,
  /alert[_-]export/i,
  /endpoint[_-]log/i,
  /detection[_-]log/i,
];

module.exports = function(input) {
  var tool = input.tool_name;

  // Block skills that send data externally
  if (tool === "Skill") {
    var skill = (input.tool_input || {}).skill || "";
    for (var i = 0; i < BLOCKED_SKILLS.length; i++) {
      if (skill === BLOCKED_SKILLS[i]) {
        return {
          decision: "block",
          reason: "DATA EXFIL GATE: The '" + skill + "' skill sends data externally.\n" +
            "POLICY: Zero customer data leaves this laptop. Investigation results,\n" +
            "alerts, detections, and RCA reports stay local only.\n" +
            "Code (without customer data) may sync to tmemu GitHub."
        };
      }
    }
    return null;
  }

  if (tool !== "Bash") return null;
  var cmd = (input.tool_input || {}).command || "";

  // Block external data transmission
  for (var j = 0; j < BLOCKED_BASH_PATTERNS.length; j++) {
    if (BLOCKED_BASH_PATTERNS[j].test(cmd)) {
      return {
        decision: "block",
        reason: "DATA EXFIL GATE: This command could transmit customer data externally.\n" +
          "POLICY: Zero customer data leaves this laptop.\n" +
          "Matched: " + BLOCKED_BASH_PATTERNS[j].toString()
      };
    }
  }

  // Block git operations that include customer data files
  if (/\bgit\s+(add|commit|push)\b/.test(cmd)) {
    for (var k = 0; k < CUSTOMER_DATA_PATHS.length; k++) {
      if (CUSTOMER_DATA_PATHS[k].test(cmd)) {
        return {
          decision: "block",
          reason: "DATA EXFIL GATE: Git operation includes a path that likely contains customer data.\n" +
            "POLICY: Customer data never goes to GitHub, even tmemu private repos.\n" +
            "Matched path: " + CUSTOMER_DATA_PATHS[k].toString() + "\n" +
            "FIX: Add the path to .gitignore instead."
        };
      }
    }
  }

  return null;
};

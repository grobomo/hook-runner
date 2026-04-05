// WORKFLOW: shtd
// WHY: Ad-hoc AWS/SSH commands died with the session. Scripts survive.
// Block ad-hoc Bash commands for AWS, SSH, Docker, and infrastructure.
// ALL operations must go through reusable scripts in scripts/.
// If a script doesn't exist, you must CREATE IT first, then use it.
// This applies to both local Claude and CCC workers.
var path = require("path");

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = (input.tool_input || {}).command || "";
  // Strip env var prefixes (MSYS_NO_PATHCONV=1 etc.) so actual command is matched (2026-04-05)
  var normalized = cmd.replace(/\s+/g, " ").trim().replace(/^([A-Z_]+=\S*\s+)+/, "");

  // Allow running scripts (the whole point) — command must START with a script path
  if (/^\s*(bash\s+)?scripts\//.test(normalized)) return null;
  if (/^\s*(bash\s+)?\.\/scripts\//.test(normalized)) return null;
  if (/^\s*(bash\s+)?[A-Za-z]:.*scripts\/.*\.sh\b/.test(normalized)) return null;
  // Allow sourcing fleet config, etc.
  if (/^\s*source\s+.*scripts\//.test(normalized)) return null;
  // Allow .sh files that aren't raw infra commands
  if (/^\s*(bash\s+)?\S+\.sh\b/.test(normalized) && !/^\s*(aws|ssh|scp|docker)\b/.test(normalized)) return null;

  // Allow basic dev tools (git, npm, node, python, pip, chmod, mkdir, ls, cat, pwd, which, echo)
  var safeTools = /^\s*(git|npm|npx|node|python|python3|pip|uv|chmod|chown|mkdir|ls|cat|pwd|which|echo|printf|test|true|false|cd|cp|mv|tar|gzip|base64|wc|sort|uniq|diff|head|tail|tee|touch|date|hostname|whoami|id|env|export|set|source|bash\s+scripts\/)\b/;
  if (safeTools.test(normalized)) return null;

  // Allow piped reads and simple checks
  if (/^\s*(cat|head|tail|grep|find|ping|nc\s)/.test(normalized)) return null;
  // Allow curl to localhost only — fleet API calls must use scripts/fleet/api-*.sh
  if (/^\s*curl\b/.test(normalized)) {
    if (/localhost|127\.0\.0\.1/.test(normalized)) return null;
    return {
      decision: "block",
      reason: "NO AD-HOC CURL to external hosts. Use scripts/fleet/api-*.sh for fleet API calls.\n" +
        "  api-submit.sh  — submit tasks\n" +
        "  api-status.sh  — check workers/tasks/health\n" +
        "  api-cancel.sh  — cancel tasks\n" +
        "Blocked: " + cmd.substring(0, 150)
    };
  }

  // Block: aws CLI (any service)
  if (/\baws\s+\w+/.test(normalized)) {
    return {
      decision: "block",
      reason: "NO AD-HOC AWS. Use or create a script in scripts/aws/.\n" +
        "If no script exists for what you need, create one first, then call it.\n" +
        "Blocked: " + cmd.substring(0, 150)
    };
  }

  // Block: terraform/azcopy
  if (/^\s*(terraform|azcopy)\s/.test(normalized)) {
    return { decision: "block", reason: "NO AD-HOC TF/AZCOPY. Script it.\nBlocked: " + cmd.substring(0, 150) };
  }
  if (/\baz\s+\w+/.test(normalized)) {
    return { decision: "block", reason: "NO AD-HOC AZ. Create a script.\nBlocked: " + cmd.substring(0, 150) };
  }
  // Block: raw SSH/SCP
  if (/^\s*(ssh|scp)\s/.test(normalized)) {
    return {
      decision: "block",
      reason: "NO AD-HOC SSH/SCP. Create a script in scripts/ for the operation.\n" +
        "Blocked: " + cmd.substring(0, 150)
    };
  }

  // Block: raw docker commands (except local docker for building)
  if (/^\s*docker\s+(exec|run|cp|stop|rm|kill|restart)\b/.test(normalized)) {
    return {
      decision: "block",
      reason: "NO AD-HOC DOCKER. Create a script in scripts/ for the operation.\n" +
        "Blocked: " + cmd.substring(0, 150)
    };
  }

  // Block: kubectl ad-hoc
  if (/^\s*kubectl\s/.test(normalized)) {
    return {
      decision: "block",
      reason: "NO AD-HOC KUBECTL. Create a script in scripts/k8s/ for the operation.\n" +
        "Blocked: " + cmd.substring(0, 150)
    };
  }

  return null;
};

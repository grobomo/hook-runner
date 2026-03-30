// Block ad-hoc Bash commands for AWS, SSH, Docker, and infrastructure.
// ALL operations must go through reusable scripts in scripts/.
// If a script doesn't exist, you must CREATE IT first, then use it.
// This applies to both local Claude and CCC workers.
var path = require("path");

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = (input.tool_input || {}).command || "";
  var normalized = cmd.replace(/\s+/g, " ").trim();

  // Allow running scripts (the whole point)
  if (/scripts\//.test(normalized)) return null;
  if (/\.sh\b/.test(normalized) && !/^\s*(aws|ssh|scp|docker)\b/.test(normalized)) return null;

  // Allow basic dev tools (git, npm, node, python, pip, chmod, mkdir, ls, cat, pwd, which, echo)
  var safeTools = /^\s*(git|npm|npx|node|python|python3|pip|uv|chmod|chown|mkdir|ls|cat|pwd|which|echo|printf|test|true|false|cd|cp|mv|tar|gzip|base64|wc|sort|uniq|diff|head|tail|tee|touch|date|hostname|whoami|id|env|export|set|source|bash\s+scripts\/)\b/;
  if (safeTools.test(normalized)) return null;

  // Allow piped reads and simple checks
  if (/^\s*(cat|head|tail|grep|find|curl.*localhost|ping|nc\s)/.test(normalized)) return null;

  // Block: aws CLI (any service)
  if (/\baws\s+\w+/.test(normalized)) {
    return {
      decision: "block",
      reason: "NO AD-HOC AWS. Use or create a script in scripts/aws/.\n" +
        "If no script exists for what you need, create one first, then call it.\n" +
        "Blocked: " + cmd.substring(0, 150)
    };
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

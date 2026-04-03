// Block raw AWS CLI commands. Force use of scripts/aws/*.sh.
// All AWS operations must go through reusable, tagged, auditable scripts.
// Returns null to pass, {decision:"block", reason:"..."} to block.
module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = (input.tool_input || {}).command || "";
  var normalized = cmd.replace(/\s+/g, " ").trim();

  // Only block direct aws CLI calls
  if (!/\baws\s+(cloudformation|ec2|s3|s3api|lambda|iam|ecs|ecr|elbv2|rds|ssm)\b/.test(normalized)) return null;

  // Allow if running through scripts/aws/
  if (/scripts\/aws\//.test(normalized)) return null;

  // Allow if sourcing common.sh (script internals)
  if (/source.*common\.sh/.test(normalized)) return null;

  // Allow read-only commands (describe, list, get) — these are safe for debugging
  if (/\b(describe|list|get)-/.test(normalized)) return null;

  // Allow validate-template (read-only)
  if (/validate-template/.test(normalized)) return null;

  // Block everything else
  return {
    decision: "block",
    reason: "NO AD-HOC AWS: Use scripts/aws/*.sh instead of raw aws CLI.\n" +
      "Available scripts:\n" +
      "  deploy-stack.sh <name> <template> [params...]\n" +
      "  delete-stack.sh <name>\n" +
      "  get-stack-output.sh <name> <key>\n" +
      "  list-fleet.sh\n" +
      "  ssh-worker.sh <name> [cmd]\n" +
      "  docker-exec.sh <name> <cmd>\n" +
      "If no script exists for what you need, CREATE ONE in scripts/aws/ first.\n" +
      "Blocked command: " + cmd.substring(0, 200)
  };
};

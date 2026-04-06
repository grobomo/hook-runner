// WORKFLOW: shtd
// WHY: AWS resources created without tags were impossible to attribute or clean up.
// Enforce hackathon26 tags on AWS resource creation commands.
// Checks: aws cloudformation, aws ec2 run-instances, aws s3api create-bucket,
// aws lambda create-function, and similar resource-creating commands.
// Returns null to pass, {decision:"block", reason:"..."} to block.
module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = (input.tool_input || {}).command || "";
  var normalized = cmd.replace(/\s+/g, " ").trim();

  // Only check commands using hackathon profile or in hackathon project context
  if (!/--profile\s+hackathon/.test(normalized)) return null;

  // AWS commands that create resources and support tags
  var createPatterns = [
    /\baws\s+cloudformation\s+(create-stack|update-stack|deploy)\b/,
    /\baws\s+ec2\s+run-instances\b/,
    /\baws\s+ec2\s+create-(volume|snapshot|security-group|vpc|subnet|key-pair)\b/,
    /\baws\s+s3api\s+create-bucket\b/,
    /\baws\s+lambda\s+create-function\b/,
    /\baws\s+iam\s+create-(role|policy|user|instance-profile)\b/,
    /\baws\s+ecs\s+create-(cluster|service|task-definition)\b/,
    /\baws\s+ecr\s+create-repository\b/,
  ];

  var isCreateCmd = false;
  for (var i = 0; i < createPatterns.length; i++) {
    if (createPatterns[i].test(normalized)) {
      isCreateCmd = true;
      break;
    }
  }

  if (!isCreateCmd) return null;

  // Check for Project=hackathon26 tag
  var hasProjectTag = /Project[=,:]hackathon26/.test(normalized) ||
    /Key=Project,Value=hackathon26/.test(normalized) ||
    /Key=Project.*Value=hackathon26/.test(normalized) ||
    /"Project"\s*:\s*"hackathon26"/.test(normalized);

  if (!hasProjectTag) {
    return {
      decision: "block",
      reason: "BLOCKED: AWS resource creation with --profile hackathon must include Project=hackathon26 tag. Add: --tags Key=Project,Value=hackathon26 (or include in CF template Tags). Command was: " + cmd.substring(0, 200)
    };
  }

  return null;
};

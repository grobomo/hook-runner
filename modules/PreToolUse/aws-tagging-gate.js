// Enforce required tags on AWS resource creation commands.
// Configure via environment variables:
//   AWS_TAG_REQUIRED_KEY   - tag key to require (default: "Project")
//   AWS_TAG_REQUIRED_VALUE - tag value to require (no default — module is inactive without it)
//   AWS_TAG_PROFILE_MATCH  - only enforce for this --profile (optional, enforces for all if unset)
// Returns null to pass, {decision:"block", reason:"..."} to block.
module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var tagKey = process.env.AWS_TAG_REQUIRED_KEY || "Project";
  var tagValue = process.env.AWS_TAG_REQUIRED_VALUE;
  if (!tagValue) return null; // not configured, skip

  var cmd = (input.tool_input || {}).command || "";
  var normalized = cmd.replace(/\s+/g, " ").trim();

  // Optionally filter by AWS profile
  var profileMatch = process.env.AWS_TAG_PROFILE_MATCH;
  if (profileMatch && !new RegExp("--profile\\s+" + profileMatch).test(normalized)) return null;

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

  // Check for required tag
  var tagPattern = new RegExp(tagKey + "[=,:]" + tagValue + "|Key=" + tagKey + ",Value=" + tagValue + "|Key=" + tagKey + ".*Value=" + tagValue + '|"' + tagKey + '"\\s*:\\s*"' + tagValue + '"');
  if (tagPattern.test(normalized)) return null;

  return {
    decision: "block",
    reason: "AWS resource creation must include " + tagKey + "=" + tagValue + " tag.\n" +
      "Add: --tags Key=" + tagKey + ",Value=" + tagValue + " (or include in CF template Tags).\n" +
      "Command: " + cmd.substring(0, 200)
  };
};

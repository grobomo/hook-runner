// TOOLS: Bash
// WORKFLOW: no-local-docker
// WHY: Local docker builds consumed disk/CPU and caused "no space left on device" failures.
// All container workloads should run on remote infrastructure (EC2, ECS, cloud-claude).
"use strict";

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = (input.tool_input && input.tool_input.command) || "";
  var trimmed = cmd.trim().replace(/^(sudo\s+)/, "");

  // Block docker and docker-compose commands
  if (/^docker(\s|$)/.test(trimmed) || /^docker-compose(\s|$)/.test(trimmed)) {
    // Allow read-only inspection commands
    if (/^docker\s+(ps|images|inspect|logs|version|info|stats)\b/.test(trimmed)) return null;
    if (/^docker-compose\s+(ps|logs|config)\b/.test(trimmed)) return null;

    return {
      decision: "block",
      reason: "BLOCKED: Local Docker commands\nWHY: Local Docker builds have caused disk space exhaustion and out-of-memory failures in this environment.\nNEXT STEPS:\n1. Use the remote build service instead\n2. Review Docker image cleanup policies with your team\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix block-local-docker — {describe the issue}\""
    };
  }

  return null;
};

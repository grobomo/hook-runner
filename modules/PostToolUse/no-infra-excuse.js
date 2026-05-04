// TOOLS: *
// WORKFLOW: shtd, starter, gsd
// WHY: Claude repeatedly claimed it "can't test" features because it "needs a real
// environment" or "requires lab infrastructure" — when it has AWS (aws skill),
// Azure, and EC2 spot instances available. This wastes user time correcting excuses.
// T602: Detect infrastructure excuses and remind Claude of available resources.
"use strict";

module.exports = function(input) {
  // Only check text output from assistant (PostToolUse sees tool results)
  // We check the tool output for assistant-generated text
  var tool = input.tool_name;

  // Skip tools that don't produce text output from Claude
  if (tool === "Read" || tool === "Glob" || tool === "Grep") return null;

  var result = (input.tool_result || "");
  if (typeof result !== "string") {
    try { result = JSON.stringify(result); } catch(e) { return null; }
  }
  if (!result || result.length < 30) return null;

  // Patterns that indicate Claude is making excuses about infrastructure
  var excusePatterns = [
    /\b(?:requires?|needs?|would need)\s+(?:a\s+)?(?:real|live|actual|production)\s+(?:environment|infrastructure|server|cluster)/i,
    /\bcan(?:'t|not)\s+(?:test|verify|validate|check)\s+(?:this\s+)?(?:without|unless)\s+(?:a\s+)?(?:real|live|running)/i,
    /\b(?:requires?|needs?)\s+(?:lab|testing)\s+infrastructure/i,
    /\b(?:requires?|needs?)\s+(?:a\s+)?(?:testing|staging|deployment)\s+environment/i,
    /\bcannot\s+be\s+tested\s+(?:locally|here|in this context)/i,
    /\bno\s+way\s+to\s+(?:test|verify)\s+(?:this\s+)?(?:without|unless)/i
  ];

  for (var i = 0; i < excusePatterns.length; i++) {
    if (excusePatterns[i].test(result)) {
      return {
        decision: "block",
        reason: "NO-INFRA-EXCUSE: Stop claiming you can't test something.\n" +
          "You have infrastructure available:\n" +
          "  - AWS: EC2 spot instances via 'aws' skill (spin up in 60s)\n" +
          "  - Azure: VMs via az CLI\n" +
          "  - Docker: Build containers via EC2 (docker-in-cloud)\n" +
          "  - RONE: K8s namespace for containerized workloads\n\n" +
          "FIX: Spin up the environment you need and test for real.\n" +
          "  If you genuinely need credentials or access you don't have, say THAT specifically."
      };
    }
  }

  return null;
};

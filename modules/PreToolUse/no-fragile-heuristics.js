// TOOLS: Edit
// WORKFLOW: shtd, gsd
// WHY: Claude wrote pixel-ratio thresholds and color-counting heuristics to
// detect blank screenshots and login pages. These broke on F5 (dark login page)
// and would false-positive on white dashboards. The user corrected: "don't make
// a fragile verification script — make claude do it."
//
// RULE: When a check requires visual/subjective judgment (screenshot quality,
// report appearance, UI state), use claude -p or the Anthropic SDK. Never write
// threshold-based heuristics (pixel ratios, color counts, regex sentiment).
//
// SCOPE: Blocks Edit/Write when the new content contains telltale patterns of
// visual heuristics being written into verification/review/check scripts.
"use strict";

module.exports = function(input) {
  if (input.tool_name !== "Edit" && input.tool_name !== "Write") return null;

  var content = "";
  if (input.tool_name === "Edit") {
    content = (input.tool_input || {}).new_string || "";
  } else {
    content = (input.tool_input || {}).content || "";
  }

  var path = (input.tool_input || {}).file_path || "";

  // Only check verification/review/check/test scripts — not all code
  var isReviewScript = /review|verify|check|quality|validate|analyz/i.test(path);
  if (!isReviewScript) return null;

  // Detect visual heuristic anti-patterns
  var patterns = [
    /pixel.*ratio|ratio.*pixel/i,
    /white_ratio|white_ish|white_percent/i,
    /unique_color|color_count|color_divers/i,
    /getpixel|getdata\(\)|\.convert\(.*RGB/i,
    /threshold.*0\.\d+.*blank|blank.*threshold/i,
    /quantize.*color|color.*quantize/i,
  ];

  for (var i = 0; i < patterns.length; i++) {
    if (patterns[i].test(content)) {
      return { decision: "block", reason: "BLOCKED: Fragile visual heuristic in \nFALSE POSITIVE? File a TODO in hook-runner: \"Fix no-fragile-heuristics — {describe the issue}\"" + path.split(/[/\\]/).pop() + ".\n" +
        "WHY: Pixel-ratio thresholds and color-counting heuristics broke on dark login pages (F5) and white dashboards — visual checks need AI, not arithmetic.\n" +
        "NEXT STEPS:\n" +
        "1. Use claude -p or the Anthropic SDK to analyze images/PDFs\n" +
        "2. Describe the check in plain English as a prompt\n" +
        "3. Send the artifact, parse structured JSON output" };
    }
  }

  return null;
};

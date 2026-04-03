// WHY: Claude tried 3 wrong ways to call claude -p (--no-input, pipe via
// echo, timeout with arg) before finding the correct pattern in an existing
// project. This gate injects the correct pattern when claude -p is attempted.
"use strict";

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;
  var cmd = (input.tool_input || {}).command || "";
  if (cmd.indexOf("claude -p") === -1 && cmd.indexOf("claude.exe -p") === -1) return null;

  // Check for known bad patterns
  var bad = [];
  if (/claude\s+-p\s+--no-input/.test(cmd)) bad.push("--no-input is not a valid flag");
  if (/echo\s+.*\|\s*claude\s+-p/.test(cmd)) bad.push("piping via echo hangs — use temp file + stdin redirect");
  if (/claude\s+-p\s+"[^"]+"\s*2?>&?1?$/.test(cmd)) bad.push("passing prompt as argument is unreliable");

  if (bad.length > 0) {
    return {
      decision: "block",
      reason: "claude -p invocation issue: " + bad.join("; ") +
        "\n\nCorrect pattern:\n" +
        "  PROMPTFILE=$(mktemp /tmp/claude-p-XXXXXX.txt)\n" +
        "  cat > \"$PROMPTFILE\" <<'EOF'\n  Your prompt here\n  EOF\n" +
        "  claude -p --dangerously-skip-permissions < \"$PROMPTFILE\" > output.txt 2>&1\n" +
        "  rm -f \"$PROMPTFILE\"\n\n" +
        "For batch/background: use Node.js child_process.execSync with stdio:['pipe','pipe','pipe'].\n" +
        "claude -p output contains quotes/backticks that corrupt bash redirection.\n" +
        "Reference: ~/Documents/ProjectsCL1/recording-analyzer/tools/analyze-all.js"
    };
  }

  return null;
};

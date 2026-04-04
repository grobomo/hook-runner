// WORKFLOW: code-quality
// WHY: Claude tried 3 wrong ways to call claude -p (--no-input, pipe via
// echo, timeout with arg) and then tried to use ANTHROPIC_API_KEY / SDK
// instead of just using claude -p correctly. The correct pattern is simple:
//   1. Write prompt to temp file
//   2. Pipe via stdin: claude -p --dangerously-skip-permissions < promptfile
//   3. No API key needed — same auth as running Claude Code session
//   4. For images/PDFs: include absolute file paths in prompt, tell Claude
//      to use its Read tool to view them. NEVER base64-inline images.
//   5. Reference: ~/Documents/ProjectsCL1/recording-analyzer/tools/analyze-next.sh
"use strict";

var CORRECT_PATTERN =
  "\n\nCorrect claude -p pattern:\n" +
  "  PROMPTFILE=$(mktemp /tmp/claude-p-XXXXXX.txt)\n" +
  "  cat > \"$PROMPTFILE\" <<'EOF'\n  Your prompt here\n  EOF\n" +
  "  claude -p --dangerously-skip-permissions < \"$PROMPTFILE\" > output.txt 2>&1\n" +
  "  rm -f \"$PROMPTFILE\"\n\n" +
  "For images/PDFs: put absolute file paths in the prompt and tell Claude\n" +
  "to use the Read tool to view them. NEVER base64-encode images inline.\n" +
  "No API key needed. No SDK needed. Same auth as Claude Code session.\n" +
  "Reference: ~/Documents/ProjectsCL1/recording-analyzer/tools/analyze-next.sh";

module.exports = function(input) {
  // === Gate 1: Bash — block bad claude -p invocations ===
  if (input.tool_name === "Bash") {
    var cmd = (input.tool_input || {}).command || "";
    if (cmd.indexOf("claude -p") === -1 && cmd.indexOf("claude.exe -p") === -1) return null;

    var bad = [];
    if (/claude\s+-p\s+--no-input/.test(cmd)) bad.push("--no-input is not a valid flag");
    if (/echo\s+.*\|\s*claude\s+-p/.test(cmd)) bad.push("piping via echo hangs — use temp file + stdin redirect");
    if (/claude\s+-p\s+"[^"]+"\s*2?>&?1?$/.test(cmd)) bad.push("passing prompt as argument is unreliable");

    if (bad.length > 0) {
      return "claude -p invocation issue: " + bad.join("; ") + CORRECT_PATTERN;
    }
    return null;
  }

  // === Gate 2: Edit/Write — block bad patterns in scripts that call claude ===
  if (input.tool_name !== "Edit" && input.tool_name !== "Write") return null;

  var content = "";
  if (input.tool_name === "Edit") {
    content = (input.tool_input || {}).new_string || "";
  } else {
    content = (input.tool_input || {}).content || "";
  }

  // Only check if content involves claude -p or anthropic SDK usage
  if (!/claude.*-p|anthropic|ANTHROPIC_API_KEY/i.test(content)) return null;

  // Allow claude -p invocation rule files / hook modules themselves
  var path = (input.tool_input || {}).file_path || "";
  if (/claude-p-pattern|run-modules/i.test(path)) return null;
  // Allow claude-api skill files
  if (/claude.api|anthropic.sdk|api.wrapper/i.test(path)) return null;

  // Anti-pattern: requiring ANTHROPIC_API_KEY (claude -p doesn't need it)
  if (/ANTHROPIC_API_KEY|os\.environ.*anthropic|api_key.*=.*os\./i.test(content)) {
    if (/not.*need|no.*key.*needed|same.*auth/i.test(content)) return null;
    return "Don't check for ANTHROPIC_API_KEY. claude -p uses Claude Code's " +
      "own auth — no API key needed." + CORRECT_PATTERN;
  }

  // Anti-pattern: base64-encoding images into prompts (too large, timeouts)
  if (/base64.*encode.*image|b64encode.*read|base64\.b64encode.*\.png/i.test(content)) {
    return "Don't base64-encode images into claude -p prompts. They're too " +
      "large and cause timeouts. Include absolute file paths in the prompt " +
      "and tell Claude to use its Read tool to view them." + CORRECT_PATTERN;
  }

  // Anti-pattern: importing anthropic SDK when claude -p would work
  if (/import anthropic|from anthropic import|anthropic\.Anthropic/i.test(content)) {
    return "Don't use the Anthropic SDK when claude -p is available. " +
      "claude -p is simpler (no API key, no SDK install)." + CORRECT_PATTERN;
  }

  return null;
};

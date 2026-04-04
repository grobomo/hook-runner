// WORKFLOW: self-improvement
// WHY: No record of what was asked across sessions, making handoffs lossy.
// UserPromptSubmit: log user prompts to JSONL for audit and review
// Logs prompt text, timestamp, and project context to ~/.claude/hooks/prompt-log.jsonl
// Never blocks — always returns null (allow)
var fs = require("fs");
var path = require("path");
var os = require("os");

var LOG_PATH = path.join(os.homedir(), ".claude", "hooks", "prompt-log.jsonl");
var MAX_SIZE = 5 * 1024 * 1024; // 5MB rotation

module.exports = function(input) {
  try {
    var prompt = "";
    if (input && input.message && typeof input.message === "string") {
      prompt = input.message;
    } else if (input && input.prompt && typeof input.prompt === "string") {
      prompt = input.prompt;
    }
    if (!prompt) return null;

    var project = process.env.CLAUDE_PROJECT_DIR || "";
    var projectName = project ? path.basename(project) : "unknown";

    var entry = JSON.stringify({
      ts: new Date().toISOString(),
      project: projectName,
      length: prompt.length,
      preview: prompt.substring(0, 200)
    }) + "\n";

    // Rotate if too large
    try {
      var stat = fs.statSync(LOG_PATH);
      if (stat.size > MAX_SIZE) {
        var bak = LOG_PATH + ".bak";
        try { fs.unlinkSync(bak); } catch(e) {}
        fs.renameSync(LOG_PATH, bak);
      }
    } catch(e) { /* file doesn't exist yet */ }

    fs.appendFileSync(LOG_PATH, entry);
  } catch(e) {
    // Never fail — logging is best-effort
  }
  return null;
};

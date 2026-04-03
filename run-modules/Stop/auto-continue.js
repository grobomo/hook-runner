// WHY: Claude stops and lists options instead of doing the work.
// Auto-continue: never stop, always find the next thing
var home = (process.env.HOME || process.env.USERPROFILE || "").replace(/\\/g, "/");

module.exports = function(input) {
  return {
    decision: "block",
    reason: "DO NOT STOP. Follow this order:\n" +
      "1) Check TODO.md — if tasks remain, do the next one NOW.\n" +
      "2) Scan jsonl logs in ~/.claude/projects/ for incomplete tangents — do them.\n" +
      "3) Optimize, secure, clean up the project.\n" +
      "4) Zoom out: what real-world value comes next? Write tasks then EXECUTE.\n\n" +
      "If context is long, save state to TODO.md then run:\n" +
      "python " + home + "/Documents/ProjectsCL1/context-reset/context_reset.py --project-dir $CLAUDE_PROJECT_DIR\n" +
      "To preserve this tab: touch ~/.claude/.preserve-tab first"
  };
};

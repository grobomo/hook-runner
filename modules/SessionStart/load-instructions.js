// WORKFLOW: shtd, starter
// WHY: Important operational context was missing at session start.
// SessionStart: inject working instructions at start of every session
module.exports = function(input) {
  // SessionStart hooks output text to Claude as context (not block/allow)
  return {
    text: "SESSION START INSTRUCTIONS: Check TODO.md in $CLAUDE_PROJECT_DIR for pending tasks. If tasks remain, do the next one. Read jsonl logs in ~/.claude/projects/ for incomplete tangents from previous sessions. Organize, optimize, secure the project. Then zoom out and expand. Always write plans to TODO.md before executing. Save state to $CLAUDE_PROJECT_DIR/TODO.md before context resets.\n\nIMPORTANT: If TODO.md has a session handoff from a previous session, read it FIRST — it tells you what was done and what matters next. Mindset: be slow and systematic. Build repeatable, modular code with excellent user experience. No rush."
  };
};

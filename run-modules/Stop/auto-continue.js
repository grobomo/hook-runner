// Auto-continue: never stop, always find the next thing
module.exports = function(input) {
  return {
    decision: "block",
    reason: "DO NOT STOP. DO NOT SUMMARIZE. DO NOT LIST OPTIONS. Follow this order: 1) Check TODO.md in $CLAUDE_PROJECT_DIR — if tasks remain, do the next one NOW. 2) Read the jsonl logs in ~/.claude/projects/ (folder matching current project path, most recent .jsonl). Scan for incomplete tangents, abandoned fixes, things discussed but never done — do them. 3) Organize, modularize, optimize, secure the project. Code review, DRY, clean up, harden. 4) Zoom out: why does this project exist, how does it integrate, what real-world value comes next? Write new tasks to TODO.md then EXECUTE. No breaks. No asking. Plan then do. If context is getting long, save state to $CLAUDE_PROJECT_DIR/TODO.md (always the launch directory, not cwd), then run: python C:/Users/joelg/Documents/ProjectsCL1/context-reset/context_reset.py --project-dir $CLAUDE_PROJECT_DIR"
  };
};

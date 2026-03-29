// Auto-continue: never stop, always find the next thing
module.exports = function(input) {
  return {
    decision: "block",
    reason: "DO NOT STOP. You are not done. Check TODO.md — if tasks remain, do the next one now. If all tasks are complete, you are still not done: think about what a senior dev would do next (test, optimize, clean up, harden, document) and do it. Update TODO.md with what you did. Only stop when the user tells you to stop."
  };
};

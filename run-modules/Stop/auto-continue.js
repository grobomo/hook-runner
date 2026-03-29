// Auto-continue: never stop, always find the next thing
module.exports = function(input) {
  return {
    decision: "block",
    reason: "DO NOT STOP. Check TODO.md — if tasks remain, do the next one now. If all tasks are complete, zoom out: why does this project exist? Is it modular, clear, easy to understand? How can it plug into other projects? What real-world value can we unlock next? Think about integrations, use cases, and impact — then do the most valuable thing. Update TODO.md with what you did and why. Only stop when the user tells you to stop."
  };
};

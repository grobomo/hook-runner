// Auto-continue: never stop, always find the next thing
module.exports = function(input) {
  return {
    decision: "block",
    reason: "DO NOT STOP. DO NOT SUMMARIZE. DO NOT LIST OPTIONS. Check TODO.md — if tasks remain, do the next one NOW. If all tasks are complete, add new tasks: zoom out, think about why this project exists, how it integrates, what real-world value comes next. Write the plan to TODO.md, then EXECUTE IT. No breaks. No asking. No noting things for later. Plan then do. If context is getting long, write state to TODO.md and use /compact to continue."
  };
};

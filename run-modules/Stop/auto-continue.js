// Auto-continue: never stop, always find the next thing
module.exports = function(input) {
  return {
    decision: "block",
    reason: "DO NOT STOP. DO NOT SUMMARIZE. DO NOT LIST OPTIONS. Follow this order: 1) Check TODO.md — if tasks remain, do the next one NOW. 2) Read the transcript jsonl at " + (input.transcript_path || "transcript_path") + " and scan for incomplete tangents, abandoned fixes, or things discussed but never done — do them. 3) If everything is truly done, zoom out: why does this project exist, how does it integrate, what real-world value comes next? Write new tasks to TODO.md then EXECUTE. No breaks. No asking. Plan then do. If context is long, write state to TODO.md and use /compact."
  };
};

// Auto-continue: makes Claude keep working instead of stopping to ask
// Migrated from sm-stop.js
module.exports = function(input) {
  return {
    decision: "block",
    reason: "review the jsonl of this convo and see what else can be done, and use your best judgement of what to implement and how, just document your why for future reference"
  };
};

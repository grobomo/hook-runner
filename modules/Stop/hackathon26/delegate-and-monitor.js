// WORKFLOW: dispatcher-worker
// WHY: Stop hook kept stopping instead of monitoring fleet workers.
// hackathon26 stop hook: delegate and monitor, never implement locally.
// Complements global auto-continue (which says "never stop").
// This adds: for hackathon26, "keep working" means monitor fleet, not code.
module.exports = function(input) {
  return {
    decision: "block",
    reason: "FLEET MONITOR MODE — You are the coordinator.\n" +
      "1) Poll worker status: bash scripts/fleet/api-status.sh workers\n" +
      "2) Poll task status: bash scripts/fleet/api-status.sh tasks\n" +
      "3) If tasks stuck PENDING with idle workers, re-register workers and resubmit\n" +
      "4) If tasks completed, check PRs: gh pr list --repo <target> --state open\n" +
      "5) Submit new work: bash scripts/fleet/api-submit.sh \"task\"\n" +
      "6) NEVER implement locally. NEVER merge PRs locally. Fleet does everything.\n" +
      "7) Keep polling every 30 seconds until brain is deployed."
  };
};

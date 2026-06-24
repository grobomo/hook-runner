// TOOLS: Bash
// WORKFLOW: shtd
// WHY: Claude checked SSH tunnel status by grepping processes (tasklist | grep ssh,
// ps aux | grep ssh). Tunnel was running but detection failed — process names don't
// reliably indicate tunnel health. User corrected: test port connectivity instead.
// T613: Block process-grep tunnel checks, suggest port connectivity test.
"use strict";

// Pattern: process listing + grep for ssh
var PROCESS_GREP_SSH = [
  /\btasklist\b[^;|&]*\|\s*(?:grep|findstr)\b[^;|&]*\bssh\b/i,
  /\bps\s+(?:aux|ef|a)\b[^;|&]*\|\s*grep\b[^;|&]*\bssh\b/i,
  /\bpgrep\b[^;|&]*\bssh\b/i,
  /\bwmic\s+process\b[\s\S]*\bssh\b/i,
];

// Allow: commands that also kill/stop/terminate (legitimate process management)
var MANAGEMENT_SKIP = /\b(kill|stop|terminate|taskkill|pkill)\b/i;

var BLOCK_MSG =
  "BLOCKED: Process-grep SSH tunnel check.\n" +
  "WHY: Process detection is unreliable — tunnel may be running but grep misses it (happened repeatedly with tasklist/ps).\n" +
  "NEXT STEPS:\n" +
  "1. Test port connectivity instead:\n" +
  "   python -c \"import urllib.request,ssl; c=ssl.create_default_context(); " +
  "c.check_hostname=False; c.verify_mode=ssl.CERT_NONE; " +
  "print(urllib.request.urlopen('https://127.0.0.1:10448/loginPage.ddei'," +
  "timeout=5,context=c).status)\"\n" +
  "2. Or run: python scripts/health-check.py --quick\n" +
  "3. If login page loads, tunnel is up. Connection refused = down.\n" +
  "FALSE POSITIVE? File a TODO in hook-runner: \"Fix tunnel-check-gate — {describe the issue}\"";

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;
  var cmd = (input.tool_input || {}).command || "";
  if (!cmd) return null;

  // Skip if command involves process management (kill/stop/terminate)
  if (MANAGEMENT_SKIP.test(cmd)) return null;

  for (var i = 0; i < PROCESS_GREP_SSH.length; i++) {
    if (PROCESS_GREP_SSH[i].test(cmd)) {
      return {
        decision: "block",
        reason: BLOCK_MSG + "\n\nDETECTED: " + cmd.substring(0, 120)
      };
    }
  }

  return null;
};

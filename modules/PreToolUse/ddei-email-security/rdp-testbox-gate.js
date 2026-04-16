// WORKFLOW: shtd, gsd
// WHY: Claude wasted an entire session reinventing RDP connection logic that
// already worked in start-e2e-test.sh (commit 21e5b3d). This hook fires on
// any RDP-related command to remind Claude of:
//   1. The PROVEN RDP pattern (powershell + cmdkey /generic: + AuthenticationLevelOverride)
//   2. joel-scripts/testbox-* is the USER'S personal testbox — hands off
//   3. Claude creates its OWN test server for E2E runs (ddei-tester, not ddei-testbox)
"use strict";

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = (input.tool_input || {}).command || "";
  var lower = cmd.toLowerCase();

  // T396/T442: Skip git/gh commands that reference "rdp" in filenames or PR body text
  if (/^\s*(git|gh_auto|gh|cat|head|tail|grep|ls|diff|less|wc)\b/.test(lower)) return null;

  // Fire on RDP connection/creation commands
  var isRdp = /\b(mstsc|cmdkey|testbox-rdp|open-rdp|testbox-create|testbox-destroy)\b/.test(lower);
  // Also match "rdp" but only in command context, not as part of a file path
  if (!isRdp && /\brdp\b/.test(lower)) {
    // If "rdp" only appears after a path separator or file extension, skip
    var stripped = lower.replace(/[a-z0-9_-]*rdp[a-z0-9_-]*\.(js|sh|md|yml|json|txt)/g, "");
    isRdp = /\brdp\b/.test(stripped);
  }
  if (!isRdp) return null;

  // Allow running joel-scripts/ (that's the user's own scripts)
  if (/joel-scripts\//.test(cmd)) return null;

  return {
    decision: "block",
    reason: "RDP + TESTBOX RULES — Read this ENTIRE message.\n\n" +
      "TWO SEPARATE TEST SERVERS:\n" +
      "  USER's testbox:   ddei-testbox (joel-scripts/testbox-*.sh) — NEVER TOUCH\n" +
      "  Claude's tester:  ddei-tester  (E2E scripts) — yours to create/destroy\n\n" +
      "THE PROVEN RDP PATTERN (from start-e2e-test.sh, commit 21e5b3d):\n" +
      "  powershell -Command \"\n" +
      "    cmdkey /generic:TERMSRV/$IP /user:$USER /pass:'$PASS'\n" +
      "    Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Terminal Server Client' " +
        "-Name 'AuthenticationLevelOverride' -Value 0 -Type DWord -Force\n" +
      "    Start-Process mstsc -ArgumentList '/v:$IP /w:1280 /h:800'\n" +
      "  \"\n\n" +
      "KEY DETAILS:\n" +
      "  - Use 'powershell' not 'powershell.exe' (avoids constrained language mode)\n" +
      "  - Use /generic:TERMSRV/ (this is what worked in E2E, despite the old rule saying /add:)\n" +
      "  - AuthenticationLevelOverride=0 skips cert warning\n" +
      "  - Password in single quotes to avoid bash ! expansion\n" +
      "  - Start-Process mstsc with /v: flag (not .rdp file, not mstsc.exe from bash)\n" +
      "  - NEVER use .rdp files — Git Bash path mangling breaks them\n" +
      "  - VERIFY connection worked: az vm run-command → query user\n\n" +
      "VM CREATION (for Claude's tester only):\n" +
      "  az vm create (NOT terraform) — RDP is auto-enabled\n" +
      "  Image: MicrosoftWindowsServer:WindowsServer:2022-datacenter:latest\n" +
      "  Password single-quoted: 'TestServer2026!'\n\n" +
      "BEFORE WRITING ANY NEW RDP CODE: Read start-e2e-test.sh from git:\n" +
      "  git show 21e5b3d:start-e2e-test.sh\n\n" +
      "Blocked: " + cmd.substring(0, 100)
  };
};

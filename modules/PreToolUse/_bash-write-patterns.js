// Shared helper: Bash patterns that indicate state-changing (write) operations.
// Used by spec-gate.js and gsd-plan-gate.js to distinguish read-only
// exploration from write operations that require task tracking.
// Underscore prefix = helper, not a module (skipped by load-modules.js).
// WHY: Gates blocked read-only commands like powershell OpenRead, python audit
// scripts, and wsl session management — all clearly not code changes.
// Real incidents from hook-log.jsonl (2026-04-30):
//   - powershell "[System.IO.Compression.ZipFile]::OpenRead(...)" blocked in dd-lab
//   - python stale-audit.py --summary blocked in ProjectsCL1
//   - wsl -e bash -c 'python3 openclaw-checkin.py' blocked in dd-lab
// T542: Flip from default-deny allowlist to write-pattern detection.
"use strict";

module.exports = [
  // File modification utilities
  /\bsed\s+-i/,                     // in-place edit
  /\bawk\s+-i/,                     // in-place edit
  /\btee\s/,                        // writes to file
  /\bcp\s/,                         // copy files
  /\bmv\s/,                         // move/rename files
  /\brm\s/,                         // delete files
  /\btouch\s/,                      // create/update timestamps
  /\bmkdir\s/,                      // create directories
  /\brmdir\s/,                      // remove directories
  /\bchmod\s/,                      // change permissions
  /\bchown\s/,                      // change ownership
  /\bln\s/,                         // create links
  /\bpatch\b/,                      // apply patches
  /\btruncate\s/,                   // truncate files
  /\binstall\s+-[a-zA-Z]/,          // install command (file copy variant)
  // Output redirection to files
  /\becho\s+.*>/,                   // echo > file
  /\bprintf\s+.*>/,                 // printf > file
  /\bcat\s+[^|]*\s*>\s*[^&]/,      // cat ... > file (not cat | cmd)
  // Build/package management
  /\bnpm\s+(install|ci|link|uninstall|publish)\b/,
  /\byarn\s+(add|install|remove)\b/,
  /\bpnpm\s+(add|install|remove)\b/,
  /\bpip3?\s+install\b/,
  /\bcargo\s+(install|build)\b/,
  /\bconda\s+(install|create)\b/,
  /\bmake\b/,                       // build via make
];

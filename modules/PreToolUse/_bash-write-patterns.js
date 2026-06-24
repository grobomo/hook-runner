// Shared helper: Bash patterns that indicate state-changing (write) operations.
// Used by spec-gate.js and gsd-plan-gate.js to distinguish read-only
// exploration from write operations that require task tracking.
// T732: Enhanced with parseBashWrite() to extract target path + content from
// Bash write commands. Used by no-hardcoded-paths, no-rules-gate, etc. to
// apply content checks to Bash file mutations (not just Edit/Write).
// Underscore prefix = helper, not a module (skipped by load-modules.js).
// WHY: Gates blocked read-only commands like powershell OpenRead, python audit
// scripts, and wsl session management — all clearly not code changes.
// Real incidents from hook-log.jsonl (2026-04-30):
//   - powershell "[System.IO.Compression.ZipFile]::OpenRead(...)" blocked in dd-lab
//   - python stale-audit.py --summary blocked in projects directory
//   - wsl -e bash -c 'python3 openclaw-checkin.py' blocked in dd-lab
// T542: Flip from default-deny allowlist to write-pattern detection.
"use strict";

var patterns = [
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
  // T608: Two fixes for false positives:
  // 1. [^;|&]* prevents matching across compound operators (;, &&, ||, |).
  //    Previously `echo x; cmd 2>/dev/null` matched because `.*` spanned `;`.
  // 2. (?<![0-9]) excludes fd redirects like 2>/dev/null (stderr is not a write).
  /\becho\s+[^;|&]*(?<![0-9])>/,   // echo > file (not 2>, single statement)
  /\bprintf\s+[^;|&]*(?<![0-9])>/, // printf > file (not 2>, single statement)
  /\bcat\s+[^;|&]*(?<![0-9])>\s*[^&]/, // cat > file (not 2>, single statement)
  // Build/package management
  /\bnpm\s+(install|ci|link|uninstall|publish)\b/,
  /\byarn\s+(add|install|remove)\b/,
  /\bpnpm\s+(add|install|remove)\b/,
  /\bpip3?\s+install\b/,
  /\bcargo\s+(install|build)\b/,
  /\bconda\s+(install|create)\b/,
  /\bmake\b/,                       // build via make
];

// T732: Extract target file path from a Bash write command.
// Returns the file path being written to, or null if not detectable.
function extractTargetPath(cmd) {
  var m;
  // tee <path>
  m = cmd.match(/\btee\s+(?:-a\s+)?["']([^"']+)["']/);
  if (m) return m[1];
  m = cmd.match(/\btee\s+(?:-a\s+)?(\S+)/);
  if (m) return m[1];
  // >> (append) before > to avoid double-match
  m = cmd.match(/>>\s*["']([^"']+)["']/);
  if (m) return m[1];
  m = cmd.match(/>>\s*(\S+)/);
  if (m) return m[1];
  // > (overwrite) — exclude fd redirects (2>, &>)
  m = cmd.match(/(?<![0-9&])>\s*["']([^"']+)["']/);
  if (m) return m[1];
  m = cmd.match(/(?<![0-9&])>\s*(\S+)/);
  if (m && m[1] !== "/dev/null") return m[1];
  // sed -i <file> (last non-flag arg)
  m = cmd.match(/\bsed\s+-i['"]*\s+(?:'[^']*'|"[^"]*")\s+["']?([^"'\s]+)/);
  if (m) return m[1];
  m = cmd.match(/\bsed\s+-i\s+.*\s(\S+)$/);
  if (m) return m[1];
  // cp/mv: destination is the last argument
  m = cmd.match(/\b(?:cp|mv)\s+(?:-[a-zA-Z]+\s+)*\S+\s+["']([^"']+)["']\s*$/);
  if (m) return m[1];
  m = cmd.match(/\b(?:cp|mv)\s+(?:-[a-zA-Z]+\s+)*\S+\s+(\S+)\s*$/);
  if (m) return m[1];
  return null;
}

// T732: Extract the content being written from a Bash command.
// Works for: echo/printf strings, heredoc bodies, tee with heredoc.
// Returns the content string, or null if content isn't visible in the command.
function extractContent(cmd) {
  // Heredoc: cat/tee > file <<'MARKER' or <<MARKER ... content ... MARKER
  var heredocMatch = cmd.match(/<<-?\s*['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\1(?:\s|$)/);
  if (heredocMatch) return heredocMatch[2];
  // echo/printf: extract everything between the command and the redirect operator.
  // Lenient — doesn't try to parse shell quoting exactly, just grabs the
  // argument portion. Handles escaped quotes, nested quotes, etc.
  var redirectMatch = cmd.match(/\b(?:echo|printf)\s+([\s\S]*?)\s*(?:>>?\s*\S)/);
  if (redirectMatch) {
    var content = redirectMatch[1];
    // Strip surrounding quotes if present
    if ((content[0] === '"' && content[content.length - 1] === '"') ||
        (content[0] === "'" && content[content.length - 1] === "'")) {
      content = content.slice(1, -1);
    }
    return content;
  }
  return null;
}

// T732: Parse a Bash command for file-write info.
// Returns {targetPath, content} or null if not a file-write command.
// content may be null even when targetPath is set (e.g., cp, sed -i).
function parseBashWrite(cmd) {
  if (!cmd) return null;
  var isWrite = patterns.some(function(rx) { return rx.test(cmd); });
  if (!isWrite) return null;
  var targetPath = extractTargetPath(cmd);
  if (!targetPath) return null;
  var content = extractContent(cmd);
  return { targetPath: targetPath, content: content };
}

// Backwards-compatible: module.exports is the patterns array
// New API: module.exports.parseBashWrite, .extractTargetPath, .extractContent
module.exports = patterns;
module.exports.parseBashWrite = parseBashWrite;
module.exports.extractTargetPath = extractTargetPath;
module.exports.extractContent = extractContent;

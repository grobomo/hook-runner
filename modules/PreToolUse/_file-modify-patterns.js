// Shared helper: Bash patterns that indicate file modification.
// Used by commit-counter-gate.js and spec-before-code-gate.js.
// Underscore prefix = helper, not a module (skipped by load-modules.js).
"use strict";

module.exports = [
  /\bsed\s+-i/,
  /\bawk\s+-i/,
  /\becho\s+.*>/,
  /\bcat\s+\S+\s+>/,
  /\btee\s/,
  /\bpython[23]?\s+.*open\s*\(.*['"]\s*w/,
  /\bprintf\s+.*>/,
  /\bcp\s+/,
  /\bmv\s+/
];

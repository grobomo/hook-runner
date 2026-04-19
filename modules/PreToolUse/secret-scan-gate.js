// TOOLS: Bash
// WORKFLOW: shtd, starter
// WHY: API keys were committed to git history and had to be rotated.
// T530: Added --name-only fast path — skips expensive full diff when all staged
// files are safe extensions (.md, .yml, .txt, etc.). Reduces 200-1416ms spikes
// to <5ms on metadata-only commits (TODO.md, CHANGELOG.md, etc.).
"use strict";
// PreToolUse: block Bash git-commit if staged diff contains obvious secrets.
// Catches API keys, tokens, passwords, and connection strings before they reach git history.
// Only triggers on git commit commands — no overhead on other tool calls.
var cp = require("child_process");

// Patterns that strongly indicate secrets (high-confidence, low false-positive)
var SECRET_PATTERNS = [
  { name: "AWS Access Key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "AWS Secret Key", re: /[0-9a-zA-Z/+=]{40}(?=\s|"|'|$)/, context: /aws_secret|secret_access|SECRET_KEY/i },
  { name: "Azure Storage Key", re: /[A-Za-z0-9+/]{86}==/ },
  { name: "Azure SAS Token", re: /sig=[A-Za-z0-9%+/=]{20,}/ },
  { name: "GitHub Token", re: /gh[ps]_[A-Za-z0-9_]{36,}/ },
  { name: "Generic API Key", re: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}/i },
  { name: "Generic Password", re: /(?:password|passwd|pwd)\s*[:=]\s*\\?["']?[^\s"']{8,}/i },
  { name: "Generic Token", re: /(?:token|secret|bearer)\s*[:=]\s*\\?["']?[A-Za-z0-9_\-.]{20,}/i },
  { name: "Private Key", re: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/ },
  { name: "Connection String", re: /(?:mongodb|postgres|mysql|redis|amqp):\/\/[^\s]{20,}/ },
];

// T530: Extensions that cannot contain secrets — skip full diff scan for these.
// .json is excluded because config files can have inline credentials.
var SAFE_EXTENSIONS = /\.(md|txt|yml|yaml|toml|css|svg|png|jpg|jpeg|gif|ico|woff2?)$/i;

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = "";
  try {
    cmd = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).command || "";
  } catch(e) { cmd = (input.tool_input || {}).command || ""; }

  // Only gate git commit
  if (!/^\s*git\s+commit/.test(cmd) && !/&&\s*git\s+commit/.test(cmd)) return null;

  // T530: Fast path — check staged file names first (cheap git spawn, ~5ms).
  // If all files are safe extensions, skip the expensive full diff (~200-1400ms).
  try {
    var names = cp.execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
      encoding: "utf-8", timeout: 5000, windowsHide: true
    }).trim();
    if (names) {
      var allSafe = names.split("\n").every(function(f) { return SAFE_EXTENSIONS.test(f.trim()); });
      if (allSafe) return null;
    } else {
      return null; // nothing staged
    }
  } catch(e) {
    // Fall through to full diff if name-only fails
  }

  // Get staged diff (only for files that could contain secrets)
  var diff = "";
  try {
    diff = cp.execFileSync("git", ["diff", "--cached", "--diff-filter=ACMR"], {
      encoding: "utf-8", timeout: 10000, maxBuffer: 1024 * 1024, windowsHide: true
    });
  } catch(e) {
    return null; // can't get diff, don't block
  }

  if (!diff) return null;

  // Only scan added lines (lines starting with +, excluding file headers)
  var addedLines = diff.split("\n").filter(function(line) {
    return line.charAt(0) === "+" && line.indexOf("+++") !== 0;
  });
  var addedText = addedLines.join("\n");

  // Filter out lines that are clearly env var references, not actual secrets
  var filteredLines = addedLines.filter(function(line) {
    // Skip lines referencing env vars / Secrets Manager / credential stores
    if (/os\.environ|process\.env|getenv|secretsmanager|get-secret-value|credential/i.test(line)) return false;
    // Skip lines that are just variable declarations with empty/placeholder values
    if (/[:=]\s*["']?\s*["']?\s*$/.test(line)) return false;
    // Skip shell variable expansions like ${DISPATCH_API_TOKEN:-}
    if (/\$\{?\w*TOKEN\w*[:\-}]/.test(line)) return false;
    if (/\$\{?\w*SECRET\w*[:\-}]/.test(line)) return false;
    return true;
  });
  var filteredText = filteredLines.join("\n");

  var findings = [];
  for (var i = 0; i < SECRET_PATTERNS.length; i++) {
    var pat = SECRET_PATTERNS[i];
    // Test each line individually to avoid cross-line false positives
    var matchFound = filteredLines.some(function(line) { return pat.re.test(line); });
    if (matchFound) {
      // If pattern has a context requirement, check it
      if (pat.context && !pat.context.test(filteredText)) continue;
      findings.push(pat.name);
    }
  }

  if (findings.length > 0) {
    return {
      decision: "block",
      reason: "SECRET SCAN: Potential secrets detected in staged changes:\n" +
        findings.map(function(f) { return "  - " + f; }).join("\n") + "\n" +
        "Review with: git diff --cached\n" +
        "If intentional (e.g. test fixtures), unstage and re-add after review.\n" +
        "Use environment variables or credential-manager instead of hardcoded secrets."
    };
  }

  return null;
};

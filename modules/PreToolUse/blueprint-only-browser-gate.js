// TOOLS: Bash
// WORKFLOW: shtd, starter
// WHY: Claude used Selenium WebDriver and ChromeDriver via Bash instead of Blueprint MCP.
// Selenium/Playwright spawn fresh browsers with no cookies, SSO, or auth state — they
// always fail on corporate/SSO pages. Blueprint operates inside the user's existing
// Chrome sessions with full authenticated state. T762.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ BLUEPRINT-ONLY BROWSER GATE                                            │
// │                                                                        │
// │ Blocks Bash commands that invoke Selenium, Playwright, Puppeteer,      │
// │ ChromeDriver, or other standalone browser automation tools.            │
// │ Redirects to Blueprint MCP which reuses authenticated Chrome sessions. │
// │                                                                        │
// │ INCIDENT HISTORY:                                                      │
// │   2026-06-01: Claude launched ChromeDriver + Selenium from Bash to     │
// │   automate a corporate SSO page. Fresh browser had no cookies/auth,    │
// │   failed immediately. Blueprint MCP would have reused the existing     │
// │   authenticated Chrome session. T762.                                  │
// └─────────────────────────────────────────────────────────────────────────┘
"use strict";

var fs = require("fs");
var path = require("path");

var LOG_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || "",
  ".claude", "hooks", "hook-log.jsonl"
);

function _log(action, detail) {
  try {
    var entry = JSON.stringify({
      ts: new Date().toISOString(),
      module: "blueprint-only-browser-gate",
      action: action,
      detail: (detail || "").substring(0, 200)
    }) + "\n";
    fs.appendFileSync(LOG_PATH, entry);
  } catch (e) { /* best effort */ }
}

// Patterns that indicate browser automation tools in Bash commands
var BROWSER_TOOL_PATTERNS = [
  /\bselenium\b/i,
  /\bwebdriver\b/i,
  /\bchromedriver\b/i,
  /\bgeckodriver\b/i,
  /\bmsedgedriver\b/i,
  /\bplaywright\b/i,
  /\bpuppeteer\b/i,
  /\bcypress\b/i,
  /\bnpx\s+playwright\b/i,
  /\bpython.*selenium/i,
  /\bfrom\s+selenium\b/i,
  /\bimport\s+selenium\b/i,
  /\brequire\s*\(\s*['"]selenium/i,
  /\brequire\s*\(\s*['"]puppeteer/i,
  /\brequire\s*\(\s*['"]playwright/i,
  /\bpip\s+install\s+selenium\b/i,
  /\bnpm\s+install\s+.*playwright\b/i,
  /\bnpm\s+install\s+.*puppeteer\b/i,
  /\bnpm\s+install\s+.*selenium/i
];

// Allow patterns — legitimate non-browser uses
var ALLOW_PATTERNS = [
  /\bgrep\b/,        // searching for references is fine
  /\bfind\b/,        // finding files is fine
  /\bcat\b.*README/, // reading docs is fine
  /--version/,       // checking versions is fine
  /--help/           // help commands are fine
];

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = ((input.tool_input || {}).command || "");
  if (!cmd) return null;

  // Check allow patterns first
  for (var a = 0; a < ALLOW_PATTERNS.length; a++) {
    if (ALLOW_PATTERNS[a].test(cmd)) return null;
  }

  // Check for browser automation tool usage
  for (var i = 0; i < BROWSER_TOOL_PATTERNS.length; i++) {
    if (BROWSER_TOOL_PATTERNS[i].test(cmd)) {
      _log("block", cmd.substring(0, 120));
      return {
        decision: "block",
        reason: "BLOCKED: Browser automation via Selenium/Playwright/Puppeteer in Bash.\n\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix blueprint-only-browser-gate — {describe the issue}\"" +
          "WHY: These tools spawn fresh browsers with no cookies, SSO, or auth state — " +
          "they always fail on corporate/SSO pages. Blueprint MCP operates inside the " +
          "user's existing Chrome sessions with full authenticated state.\n" +
          "NEXT STEPS:\n" +
          "1. Use Blueprint MCP via mcp-manager: mcpm call blueprint-extra browser_navigate\n" +
          "2. For tab management: mcpm call blueprint-extra browser_tabs\n" +
          "3. For clicking/typing: mcpm call blueprint-extra browser_interact"
      };
    }
  }

  return null;
};

// TOOLS: mcp__mcp-manager__mcpm
// WORKFLOW: shtd, gsd, starter
// WHY: During CEGP screenshot task, Claude repeatedly opened V1 console in regular
// Chrome (not incognito), causing SSO conflicts. Didn't check for existing tabs
// before opening new ones. Didn't know V1 credentials were in keyring. Lost time
// to SSO extension blocking Blueprint on login pages.
//
// This gate fires on every Blueprint MCP call and injects contextual guidance:
// - V1 console: MUST use incognito, credentials in keyring
// - Auth/SSO pages: Playwright CDP alternative
// - SharePoint: always new tab (SPA loading spinner bug)
// - Tab hygiene: check existing tabs before opening new ones
"use strict";

var path = require("path");
var fs = require("fs");
var os = require("os");

var LOG_PATH = path.join(os.homedir(), ".claude", "hooks", "hook-log.jsonl");

function log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "blueprint-guidance-gate";
  entry.event = "PreToolUse";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8"); } catch (e) {}
}

// --- URL pattern rules ---

var RULES = [
  {
    name: "v1-console-incognito",
    test: function(url) {
      return /xdr\.trendmicro\.com|v1\.trendmicro\.com|portal\.xdr\.trendmicro/i.test(url);
    },
    decision: "block",
    message: function() {
      return [
        "V1-CONSOLE: Must open in INCOGNITO to avoid SSO conflicts with work account.",
        "",
        "CORRECT approach:",
        "  1. Use browser_tabs action='new' incognito=true url='https://portal.xdr.trendmicro.com'",
        "  2. Credentials stored in keyring:",
        "     - Username: python -c \"import keyring; print(keyring.get_password('claude-code', 'v1-console/USERNAME'))\"",
        "     - Email: python -c \"import keyring; print(keyring.get_password('claude-code', 'v1-console/LOGIN_EMAIL'))\"",
        "     - Password: python -c \"import keyring; print(keyring.get_password('claude-code', 'v1-console/PASSWORD'))\"",
        "  3. For automated login flows, use Playwright CDP on port 9223 (not Blueprint).",
        "",
        "NEVER open V1 in regular Chrome — corporate SSO extension intercepts the login.",
        "",
        'FALSE POSITIVE? File a TODO in hook-runner: "Fix blueprint-guidance-gate — {describe the issue}"',
      ].join("\n");
    }
  },
  {
    name: "sso-auth-page",
    test: function(url) {
      return /signin\.|\/reauth|login\.microsoftonline|accounts\.google\.com\/signin/i.test(url);
    },
    decision: null, // non-blocking warning
    message: function() {
      return [
        "SSO/AUTH PAGE DETECTED: Blueprint cannot attach debugger to chrome-extension:// redirects.",
        "If login is needed, use Playwright CDP (port 9223) for auth flows instead.",
        "After auth completes, switch back to Blueprint for page interaction.",
      ].join("\n");
    }
  },
  {
    name: "sharepoint-new-tab",
    test: function(url) {
      return /sharepoint\.com|stream\.office\.com/i.test(url);
    },
    decision: null, // non-blocking warning
    message: function() {
      return [
        "SHAREPOINT/STREAM: Always open in a NEW tab. Never reuse existing SharePoint tabs.",
        "The SPA gets stuck on a loading spinner if you navigate within an existing tab.",
        "After nav clicks, check tab is attached. If detached, reattach with browser_tabs action='attach'.",
      ].join("\n");
    }
  }
];

// --- Extract URL from MCP call arguments ---

function extractUrl(args) {
  if (!args) return "";
  // Direct url field (browser_navigate, browser_tabs new)
  if (args.url) return args.url;
  // Nested in arguments object (mcp-manager proxy wraps args)
  if (args.arguments) {
    if (typeof args.arguments === "string") {
      try { var parsed = JSON.parse(args.arguments); return parsed.url || ""; } catch (e) {}
    }
    if (typeof args.arguments === "object" && args.arguments.url) return args.arguments.url;
  }
  return "";
}

// --- Extract Blueprint tool and action from MCP call ---

function parseMcpCall(toolInput) {
  if (!toolInput) return null;
  // mcp-manager proxy: operation=call, server=blueprint-extra, tool=browser_*, arguments={...}
  if (toolInput.operation !== "call") return null;
  var server = (toolInput.server || "").toLowerCase();
  if (server.indexOf("blueprint") < 0) return null;
  // arguments can be object or JSON string
  var args = toolInput.arguments || {};
  if (typeof args === "string") {
    try { args = JSON.parse(args); } catch (e) { args = {}; }
  }
  return {
    tool: toolInput.tool || "",
    action: (args && typeof args === "object") ? (args.action || "") : "",
    arguments: args
  };
}

module.exports = function(input) {
  if (input.tool_name !== "mcp__mcp-manager__mcpm") return null;

  var toolInput = input.tool_input || {};
  if (typeof toolInput === "string") {
    try { toolInput = JSON.parse(toolInput); } catch (e) { return null; }
  }

  // Only intercept Blueprint MCP calls
  var call = parseMcpCall(toolInput);
  if (!call) return null;

  // Extract URL from the call
  var url = extractUrl(call.arguments);

  // Tab hygiene: if opening a new tab, remind to check existing tabs first
  if (call.tool === "browser_tabs" && call.action === "new" && url) {
    // Check URL rules first — they take priority
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i].test(url)) {
        var msg = RULES[i].message();
        log({ result: RULES[i].decision || "warn", rule: RULES[i].name, url: url.substring(0, 80) });

        if (RULES[i].decision === "block") {
          return { decision: "block", reason: msg };
        }
        // Non-blocking: emit to stderr so Claude sees it, but don't block
        process.stderr.write("[blueprint-guidance-gate] " + RULES[i].name + ": " + msg.split("\n")[0] + "\n");
        return null;
      }
    }

    // Generic tab hygiene reminder (non-blocking)
    process.stderr.write("[blueprint-guidance-gate] TIP: Check existing tabs with browser_tabs action='list' before opening new ones.\n");
    log({ result: "pass", rule: "tab-hygiene-reminder", url: url.substring(0, 80) });
    return null;
  }

  // For browser_navigate or other tools, check URL rules
  if (url) {
    for (var j = 0; j < RULES.length; j++) {
      if (RULES[j].test(url)) {
        var msg2 = RULES[j].message();
        log({ result: RULES[j].decision || "warn", rule: RULES[j].name, url: url.substring(0, 80) });

        if (RULES[j].decision === "block") {
          return { decision: "block", reason: msg2 };
        }
        process.stderr.write("[blueprint-guidance-gate] " + RULES[j].name + ": " + msg2.split("\n")[0] + "\n");
        return null;
      }
    }
  }

  return null;
};

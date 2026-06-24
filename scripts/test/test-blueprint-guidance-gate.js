#!/usr/bin/env node
"use strict";
// Test suite for blueprint-guidance-gate module (T674)

var path = require("path");
var MOD = path.join(__dirname, "../../modules/PreToolUse/blueprint-guidance-gate.js");

var pass = 0, fail = 0;
function assert(name, ok) {
  if (ok) { console.log("  PASS: " + name); pass++; }
  else { console.log("  FAIL: " + name); fail++; }
}

var gate = require(MOD);

console.log("=== hook-runner: blueprint-guidance-gate (T674) ===");

// Helper to build a Blueprint MCP call input
function blueprintCall(tool, args) {
  return {
    tool_name: "mcp__mcp-manager__mcpm",
    tool_input: {
      operation: "call",
      server: "blueprint-extra",
      tool: tool,
      arguments: args || {}
    }
  };
}

// --- V1 Console URL blocking ---

// 1. V1 portal URL -> blocked
var r1 = gate(blueprintCall("browser_tabs", { action: "new", url: "https://portal.xdr.trendmicro.com" }));
assert("V1 portal URL blocked", r1 && r1.decision === "block");

// 2. V1 portal URL with path -> blocked
var r2 = gate(blueprintCall("browser_tabs", { action: "new", url: "https://portal.xdr.trendmicro.com/index.html#/app/workbench" }));
assert("V1 portal URL with path blocked", r2 && r2.decision === "block");

// 3. V1 URL via browser_navigate -> blocked
var r3 = gate(blueprintCall("browser_navigate", { url: "https://portal.xdr.trendmicro.com/index.html" }));
assert("V1 URL via browser_navigate blocked", r3 && r3.decision === "block");

// 4. Block reason mentions incognito
assert("block reason mentions INCOGNITO", r1 && r1.reason.indexOf("INCOGNITO") !== -1);

// 5. Block reason mentions keyring credentials
assert("block reason mentions keyring", r1 && r1.reason.indexOf("keyring") !== -1);

// 6. Block reason mentions v1-console/USERNAME
assert("block reason mentions v1-console/USERNAME", r1 && r1.reason.indexOf("v1-console/USERNAME") !== -1);

// 7. Block reason mentions v1-console/PASSWORD
assert("block reason mentions v1-console/PASSWORD", r1 && r1.reason.indexOf("v1-console/PASSWORD") !== -1);

// --- Non-V1 URLs pass ---

// 8. Regular URL -> pass
var r8 = gate(blueprintCall("browser_tabs", { action: "new", url: "https://example.com" }));
assert("regular URL passes", r8 === null);

// 9. Google URL -> pass
var r9 = gate(blueprintCall("browser_navigate", { url: "https://www.google.com" }));
assert("Google URL passes", r9 === null);

// --- Non-Blueprint MCP calls pass ---

// 10. wiki-lite MCP call -> pass
var r10 = gate({
  tool_name: "mcp__mcp-manager__mcpm",
  tool_input: { operation: "call", server: "wiki-lite", tool: "search", arguments: { query: "test" } }
});
assert("wiki-lite MCP call passes", r10 === null);

// 11. v1-lite MCP call -> pass
var r11 = gate({
  tool_name: "mcp__mcp-manager__mcpm",
  tool_input: { operation: "call", server: "v1-lite", tool: "v1_alerts" }
});
assert("v1-lite MCP call passes", r11 === null);

// --- Non-MCP tools pass ---

// 12. Bash tool -> pass
var r12 = gate({ tool_name: "Bash", tool_input: { command: "echo hello" } });
assert("Bash tool passes", r12 === null);

// 13. Edit tool -> pass
var r13 = gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/foo.txt" } });
assert("Edit tool passes", r13 === null);

// 14. Read tool -> pass
var r14 = gate({ tool_name: "Read", tool_input: { file_path: "/tmp/foo.txt" } });
assert("Read tool passes", r14 === null);

// --- Non-call operations pass ---

// 15. start operation -> pass
var r15 = gate({
  tool_name: "mcp__mcp-manager__mcpm",
  tool_input: { operation: "start", server: "blueprint-extra" }
});
assert("start operation passes", r15 === null);

// 16. stop operation -> pass
var r16 = gate({
  tool_name: "mcp__mcp-manager__mcpm",
  tool_input: { operation: "stop", server: "blueprint-extra" }
});
assert("stop operation passes", r16 === null);

// 17. list_servers operation -> pass
var r17 = gate({
  tool_name: "mcp__mcp-manager__mcpm",
  tool_input: { operation: "list_servers" }
});
assert("list_servers operation passes", r17 === null);

// --- SharePoint URLs (non-blocking warning) ---

// 18. SharePoint URL -> pass (warning emitted to stderr, not a block)
var r18 = gate(blueprintCall("browser_tabs", { action: "new", url: "https://trendmicro.sharepoint.com/sites/test" }));
assert("SharePoint URL passes (non-blocking)", r18 === null);

// 19. Stream URL -> pass (non-blocking)
var r19 = gate(blueprintCall("browser_navigate", { url: "https://web.microsoftstream.com/video/123" }));
assert("Stream URL passes (non-blocking)", r19 === null);

// --- Auth/SSO URLs (non-blocking warning) ---

// 20. Microsoft login page -> pass (non-blocking)
var r20 = gate(blueprintCall("browser_navigate", { url: "https://login.microsoftonline.com/common/oauth2" }));
assert("Microsoft login URL passes (non-blocking)", r20 === null);

// 21. Generic signin URL -> pass (non-blocking)
var r21 = gate(blueprintCall("browser_navigate", { url: "https://signin.example.com/auth" }));
assert("Generic signin URL passes (non-blocking)", r21 === null);

// --- Edge cases ---

// 22. Empty tool_input -> pass
var r22 = gate({ tool_name: "mcp__mcp-manager__mcpm", tool_input: {} });
assert("empty tool_input passes", r22 === null);

// 23. String tool_input -> pass (invalid JSON)
var r23 = gate({ tool_name: "mcp__mcp-manager__mcpm", tool_input: "not json" });
assert("invalid string tool_input passes", r23 === null);

// 24. Null tool_input -> pass
var r24 = gate({ tool_name: "mcp__mcp-manager__mcpm", tool_input: null });
assert("null tool_input passes", r24 === null);

// 25. Missing tool_name -> pass
var r25 = gate({ tool_input: { operation: "call", server: "blueprint-extra" } });
assert("missing tool_name passes", r25 === null);

// 26. browser_tabs with no URL -> pass
var r26 = gate(blueprintCall("browser_tabs", { action: "list" }));
assert("browser_tabs list (no URL) passes", r26 === null);

// 27. Nested arguments (string JSON)
var r27 = gate({
  tool_name: "mcp__mcp-manager__mcpm",
  tool_input: {
    operation: "call",
    server: "blueprint-extra",
    tool: "browser_navigate",
    arguments: JSON.stringify({ url: "https://portal.xdr.trendmicro.com" })
  }
});
// String arguments with V1 URL — extractUrl tries JSON.parse on string arguments
assert("string arguments with V1 URL blocked", r27 && r27.decision === "block");

// Summary
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

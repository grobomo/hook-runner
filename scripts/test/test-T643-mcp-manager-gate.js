#!/usr/bin/env node
"use strict";
var path = require("path");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/mcp-manager-gate.js"));

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}
function blocks(input) {
  var r = gate(input);
  return r && r.decision === "block";
}
function passes(input) {
  return gate(input) === null;
}

console.log("=== hook-runner: mcp-manager-gate (T643) ===\n");

// --- Non-MCP files pass ---
ok("Edit non-mcp file passes", passes({
  tool_name: "Edit", tool_input: { file_path: "/home/ubu/project/config.json", old_string: "a", new_string: "b" }
}));
ok("Write non-mcp file passes", passes({
  tool_name: "Write", tool_input: { file_path: "/home/ubu/project/package.json", content: "{}" }
}));

// --- Direct server additions to .mcp.json blocked ---
ok("direct server in .mcp.json blocked (command)", blocks({
  tool_name: "Edit", tool_input: {
    file_path: "/home/ubu/project/.mcp.json",
    old_string: "{}",
    new_string: '{ "mcpServers": { "my-server": { "command": "node", "args": ["server.js"] } } }'
  }
}));
ok("direct server with url blocked", blocks({
  tool_name: "Write", tool_input: {
    file_path: "/home/ubu/project/.mcp.json",
    content: '{ "mcpServers": { "remote": { "url": "http://localhost:3000" } } }'
  }
}));
ok("direct server with args blocked", blocks({
  tool_name: "Edit", tool_input: {
    file_path: "/home/ubu/project/.mcp.json",
    old_string: "{}",
    new_string: '{ "mcpServers": { "fs": { "command": "npx", "args": ["@modelcontextprotocol/server-filesystem"] } } }'
  }
}));

// --- mcp-manager entries pass ---
ok("mcp-manager entry passes", passes({
  tool_name: "Write", tool_input: {
    file_path: "/home/ubu/project/.mcp.json",
    content: '{ "mcpServers": { "mcp-manager": { "command": "node", "args": ["build/index.js"] } } }'
  }
}));
ok("mcpm entry passes", passes({
  tool_name: "Edit", tool_input: {
    file_path: "/home/ubu/project/.mcp.json",
    old_string: "{}",
    new_string: '{ "mcpServers": { "mcp_manager": { "command": "node" } } }'
  }
}));

// --- Empty content passes ---
ok("empty new_string passes", passes({
  tool_name: "Edit", tool_input: { file_path: "/home/ubu/.mcp.json", old_string: "x", new_string: "" }
}));

// --- Bash: direct MCP server invocations blocked ---
ok("npx @modelcontextprotocol blocked", blocks({
  tool_name: "Bash", tool_input: { command: "npx @modelcontextprotocol/server-filesystem /tmp" }
}));
ok("npx mcp-server-* blocked", blocks({
  tool_name: "Bash", tool_input: { command: "npx mcp-server-sqlite data.db" }
}));
ok("node mcp relay blocked", blocks({
  tool_name: "Bash", tool_input: { command: "node /path/to/mcp-relay-server.js" }
}));
ok("python mcp server blocked", blocks({
  tool_name: "Bash", tool_input: { command: "python3 mcp_server.py --port 3000" }
}));

// --- Normal Bash commands pass ---
ok("normal bash passes", passes({
  tool_name: "Bash", tool_input: { command: "ls -la" }
}));
ok("git command passes", passes({
  tool_name: "Bash", tool_input: { command: "git status" }
}));
ok("npm install passes", passes({
  tool_name: "Bash", tool_input: { command: "npm install" }
}));
ok("mcpm command passes", passes({
  tool_name: "Bash", tool_input: { command: "mcpm call mcp-manager start server=blueprint" }
}));

// --- Non-Bash/Edit/Write tools pass ---
ok("Read tool passes", passes({ tool_name: "Read", tool_input: {} }));
ok("Agent tool passes", passes({ tool_name: "Agent", tool_input: {} }));

// --- Block message quality ---
var r = gate({
  tool_name: "Write", tool_input: {
    file_path: "/project/.mcp.json",
    content: '{ "mcpServers": { "test": { "command": "node" } } }'
  }
});
ok("block mentions servers.yaml", r && /servers\.yaml/.test(r.reason));
ok("block mentions mcp-manager", r && /mcp-manager/.test(r.reason));

var r2 = gate({
  tool_name: "Bash", tool_input: { command: "npx @modelcontextprotocol/server-filesystem /tmp" }
});
ok("bash block mentions mcp-manager", r2 && /mcp-manager/.test(r2.reason));
ok("bash block shows detected command", r2 && /Detected/.test(r2.reason));

console.log("\n" + pass + "/" + (pass + fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
